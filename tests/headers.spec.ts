import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type Response } from './test';
import { DIST_DIR } from './routes';
import { waitForHydration } from './settle';
import { collectViolations } from './policy-server';
import { REFLOW_VIEWPORT } from './wcag';
import { ASSET_CACHE_CONTROL, usePolicyServer } from './headers-fixture';

/** Browser behaviour under the served headers; tests/headers-rules.spec.ts checks the rules. */

/** Under the 30s test budget, so the named assertion fires, not a timeout. */
const ASSET_TIMEOUT_MS = 10_000;

/**
 * `/_astro/` URLs the built homepage declares, read from the file so "nothing
 * requested" cannot pass. An `<img>` is one group satisfied by any `srcset`
 * candidate; transitive imports are left out.
 */
const declaredAssets = (): string[][] => {
  const html = readFileSync(join(DIST_DIR, 'index.html'), 'utf8');
  const paths = (text: string): string[] => [
    ...new Set(
      [...text.matchAll(/\/_astro\/[A-Za-z0-9._-]+/g)].map((m) => m[0]),
    ),
  ];

  // A browser fetches one candidate per <picture> or bare <img>, so each is one group.
  const image = /<picture\b[\s\S]*?<\/picture>|<img\b[^>]*>/g;
  const groups = [
    ...[...html.matchAll(image)].map((m) => paths(m[0])),
    ...paths(html.replace(image, '')).map((path) => [path]),
  ].filter((group) => group.length > 0);

  expect(
    groups.length,
    'dist/index.html references nothing under /_astro/.',
  ).toBeGreaterThan(0);

  return [...new Map(groups.map((group) => [group.join(' '), group])).values()];
};

const collectAssetResponses = (page: Page): Response[] => {
  const assetResponses: Response[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/_astro/')) {
      assetResponses.push(response);
    }
  });
  return assetResponses;
};

const armArrivals = (
  page: Page,
  origin: string,
  declared: string[][],
): Promise<string[] | null>[] =>
  declared.map((group) =>
    page
      .waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return url.origin === origin && group.includes(url.pathname);
        },
        { timeout: ASSET_TIMEOUT_MS },
      )
      .then(() => group)
      .catch(() => null),
  );

/*
 * Each image in turn: lazy images are requested only near the viewport, and a
 * jump to the bottom skips some in Firefox. Two frames per stop.
 */
const scrollEveryImageIntoView = (page: Page): Promise<void> =>
  page.evaluate(async () => {
    for (const image of Array.from(document.images)) {
      image.scrollIntoView({ block: 'center' });
      await new Promise<void>((settled) =>
        requestAnimationFrame(() => requestAnimationFrame(() => settled())),
      );
    }
  });

/* Subset: transitive imports are the browser's business; one file per declared group must arrive. */
const expectEveryGroupServed = (
  declared: string[][],
  assetResponses: Response[],
): void => {
  const served = new Set(
    assetResponses.map((response) => new URL(response.url()).pathname),
  );
  expect(
    declared.filter((group) => !group.some((path) => served.has(path))),
    'the homepage did not load every /_astro/ asset dist/index.html declares.',
  ).toEqual([]);
};

const expectAssetHeaders = async (
  assetResponses: Response[],
): Promise<void> => {
  for (const response of assetResponses) {
    const received = await response.allHeaders();
    const path = new URL(response.url()).pathname;

    expect(received['cache-control'], `${path} is not cached`).toBe(
      ASSET_CACHE_CONTROL,
    );
    expect(
      received['cross-origin-resource-policy'],
      `${path} is embeddable off-origin`,
    ).toBe('same-origin');

    /* Cloudflare merges rules, so a doubled `nosniff, nosniff` is the merge failure. */
    expect(received['x-content-type-options'], `${path} lost nosniff`).toBe(
      'nosniff',
    );
  }
};

test.describe('security headers', () => {
  // A stalled Firefox page.goto never recovers (playwright.config.ts), so fail it early.
  test.use({ navigationTimeout: 15_000 });

  const policy = usePolicyServer();

  /** What a browser actually received for a real asset, not what the parser resolves. */
  test('a hashed asset is served cacheable and not embeddable', async ({
    page,
  }) => {
    const assetResponses = collectAssetResponses(page);

    /* Armed before navigating; each wait is bounded and resolves null so the assertion names the asset. */
    const declared = declaredAssets();
    const arrivals = armArrivals(page, policy().origin, declared);

    await page.goto(`${policy().origin}/`, { waitUntil: 'domcontentloaded' });

    await scrollEveryImageIntoView(page);

    const arrived = await Promise.all(arrivals);
    expect(
      declared
        .filter((_, index) => arrived[index] === null)
        .map((group) => group.join(' or ')),
      `declared /_astro/ asset(s) never arrived within ${ASSET_TIMEOUT_MS}ms; the CSP may block them.`,
    ).toEqual([]);

    await waitForHydration(page);

    expectEveryGroupServed(declared, assetResponses);
    await expectAssetHeaders(assetResponses);
  });

  /* Chromium loads no rule set when the file arrives as application/json. */
  test('Chromium accepts the speculation rules', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'speculation rules are Chromium only',
    );
    const cdp = await page.context().newCDPSession(page);
    const ruleSets: { errorType?: string }[] = [];
    cdp.on('Preload.ruleSetUpdated', (event) => ruleSets.push(event.ruleSet));
    await cdp.send('Preload.enable');
    await page.goto(`${policy().origin}/`);
    await expect
      .poll(() => ruleSets.length, { message: 'no rule set was loaded' })
      .toBeGreaterThan(0);
    expect(
      ruleSets.map((set) => set.errorType ?? 'ok'),
      'Chromium rejected the speculation rules',
    ).toEqual(['ok']);
  });

  test('the site runs clean under the policy: no violations, fonts load', async ({
    page,
  }) => {
    const violations = await collectViolations(page);

    await page.goto(`${policy().origin}/`);
    await waitForHydration(page);
    await page.evaluate(() => document.fonts.ready);

    expect(violations, 'the browser refused something under the CSP').toEqual(
      [],
    );

    // Fails if the font moves off-origin without a font-src change.
    /* Not `document.fonts.check`: it returns true for a family with no face at all. */
    const loaded = await page.evaluate(() =>
      [...document.fonts].some(
        (face) => face.family.includes('Lexend') && face.status === 'loaded',
      ),
    );
    expect(loaded, "Lexend did not load under font-src 'self'").toBe(true);
  });

  test('the mobile menu still hydrates and opens under the policy', async ({
    page,
  }) => {
    const violations = await collectViolations(page);

    await page.setViewportSize(REFLOW_VIEWPORT);
    await page.goto(`${policy().origin}/`);
    await waitForHydration(page);

    const trigger = page.getByRole('button', { name: /menu/i });
    await trigger.click();

    const panel = page.getByRole('dialog');
    await expect(
      panel,
      'the menu did not open; the policy may have blocked src/scripts/mobile-menu.ts',
    ).toBeVisible();

    await expect(panel.getByRole('link')).not.toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();

    expect(violations, 'the browser refused something under the CSP').toEqual(
      [],
    );
  });
});
