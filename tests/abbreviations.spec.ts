import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './test';
import { FUNCTIONAL_ROUTES, firstUse, mainText } from './first-use';
import { builtHtml, builtPages } from './routes';
import { gotoSettled } from './settle';
import { NODE } from './tags';

/**
 * SC 3.1.4 Abbreviations, by H28 with a programmatic expansion: on functional
 * pages each abbreviation's first use in `<main>` is described by its
 * expansion (src/components/Abbr.astro). Posts, About and Career are the
 * owner's copy and are not listed.
 */
const FIRST_USES: readonly {
  route: string;
  abbreviation: string;
  expansion: string;
}[] = [
  {
    route: '/accessibility',
    abbreviation: 'WCAG',
    expansion: 'Web Content Accessibility Guidelines',
  },
  {
    route: '/accessibility',
    abbreviation: 'AA',
    expansion: "the middle of WCAG's three levels",
  },
  {
    route: '/accessibility',
    abbreviation: 'AAA',
    expansion: "the highest of WCAG's three levels",
  },
  {
    route: '/accessibility',
    abbreviation: 'PDF',
    expansion: 'Portable Document Format',
  },
  { route: '/brand', abbreviation: 'CSS', expansion: 'Cascading Style Sheets' },
  {
    route: '/brand',
    abbreviation: 'WCAG',
    expansion: 'Web Content Accessibility Guidelines',
  },
  {
    route: '/brand',
    abbreviation: 'AA',
    expansion: "the middle of WCAG's three levels",
  },
  {
    route: '/brand',
    abbreviation: 'AAA',
    expansion: "the highest of WCAG's three levels",
  },
  {
    route: '/brand',
    abbreviation: 'CC BY',
    expansion: 'Creative Commons Attribution',
  },
  { route: '/brand', abbreviation: 'CC0', expansion: 'Creative Commons Zero' },
  { route: '/privacy', abbreviation: 'IP', expansion: 'Internet Protocol' },
  {
    route: '/privacy',
    abbreviation: 'IPv6',
    expansion: 'Internet Protocol version 6',
  },
  {
    route: '/privacy',
    abbreviation: 'SHA-256',
    expansion: 'Secure Hash Algorithm 256',
  },
  {
    route: '/privacy',
    abbreviation: 'IPv4',
    expansion: 'Internet Protocol version 4',
  },
];

/** Names that are written in capitals, not abbreviations a reader must expand. */
const NAMES = [
  'Tailwind CSS',
  'Cloudflare D1',
  'R2-D2',
  'Episode IV',
  'SIL Open Font License',
  'MIT',
  'ACCESSIBILITY.md',
  'A11Y.md',
  'LICENSE-photos',
];

const ABBREVIATION = /\bCC BY\b|\bIPv[46]\b|\b[A-Z][A-Z0-9]+(?:-\d+)?\b/g;
const HEX_COLOUR = /^[0-9A-F]{6}$/;

/** Abbreviations replaced by the word itself wherever they would appear. */
const SPELLED_OUT: readonly { pattern: RegExp; word: string }[] = [
  { pattern: /\d+\s+min read/, word: 'minute' },
];

/* Any listed route: the behaviour lives in one module. */
const TIP_ROUTE = '/privacy';
const TIP_ABBREVIATION = 'IPv6';
const NARROW = { width: 320, height: 720 };
const CROSSING_STEPS = 10;

/* gotoSettled waits for the menu script only; this waits for src/scripts/abbr-tips.ts. */
const abbrReady = async (page: Page) =>
  expect(
    page.locator('[data-abbr]:not([data-abbr-ready])'),
    'an abbreviation was never enhanced, so its script did not run.',
  ).toHaveCount(0);
const SUBPIXEL_PX = 1;

test.describe('abbreviations are expanded at first use (SC 3.1.4)', () => {
  const routes = [...new Set(FIRST_USES.map((entry) => entry.route))];

  for (const route of routes) {
    test(`${route} describes each abbreviation by its expansion where it first appears`, async ({
      page,
    }) => {
      await gotoSettled(page, route);

      for (const { abbreviation, expansion } of FIRST_USES.filter(
        (entry) => entry.route === route,
      )) {
        const use = await firstUse(page, abbreviation);
        expect(
          use,
          `${abbreviation} no longer appears in ${route}'s <main>; remove its entry.`,
        ).not.toBeNull();
        expect(
          use!.description,
          `${route} first uses ${abbreviation} without "${expansion}" as its description.`,
        ).toBe(expansion);
        await expect(
          page.getByRole('button', { name: abbreviation, exact: true }).first(),
          `${route}: ${abbreviation} is not a button described by its expansion.`,
        ).toHaveAccessibleDescription(expansion);
      }
    });

    test(`${route} opens each expansion without JavaScript`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      /* Not gotoSettled: it waits for the menu script, which cannot run here. */
      await page.goto(route);

      for (const { abbreviation, expansion } of FIRST_USES.filter(
        (entry) => entry.route === route,
      )) {
        const button = page
          .getByRole('button', { name: abbreviation, exact: true })
          .first();
        await button.click();
        await expect(
          button.locator('xpath=..').locator('.abbr-tip'),
          `${route}: ${abbreviation}'s button does not open "${expansion}" without JavaScript.`,
        ).toHaveText(expansion);
        await page.keyboard.press('Escape');
      }
      await context.close();
    });
  }
});

test.describe('an abbreviation shows its expansion on demand (SC 3.1.4, 1.4.13)', () => {
  const trigger = (page: Page) =>
    page.getByRole('button', { name: TIP_ABBREVIATION, exact: true });
  const tip = (page: Page) =>
    trigger(page).locator('xpath=..').locator('.abbr-tip');

  test.beforeEach(async ({ page }) => {
    await gotoSettled(page, TIP_ROUTE);
    await abbrReady(page);
  });

  test('keyboard focus shows it and Escape hides it', async ({ page }) => {
    await trigger(page).focus();
    await expect(tip(page), 'focus does not show the expansion.').toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tip(page), 'Escape does not hide the expansion.').toBeHidden();
  });

  test('a tap shows it until a second tap', async ({ page }) => {
    await trigger(page).click();
    await expect(tip(page), 'a tap does not show the expansion.').toBeVisible();
    await trigger(page).click();
    await expect(tip(page), 'a second tap does not hide it.').toBeHidden();
  });

  test('it stays while the pointer crosses onto it, and goes when it leaves', async ({
    page,
  }) => {
    await trigger(page).scrollIntoViewIfNeeded();
    const button = await trigger(page).boundingBox();
    await page.mouse.move(
      button!.x + button!.width / 2,
      button!.y + button!.height / 2,
    );
    await expect(tip(page), 'hover does not show the expansion.').toBeVisible();
    const box = await tip(page).boundingBox();
    /* Straight down in small steps, so every point between the two is crossed. */
    await page.mouse.move(
      button!.x + button!.width / 2,
      box!.y + box!.height / 2,
      {
        steps: CROSSING_STEPS,
      },
    );
    await expect(
      tip(page),
      'the expansion vanishes on the way onto it (SC 1.4.13 hoverable).',
    ).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(
      tip(page),
      'the expansion stays after the pointer leaves.',
    ).toBeHidden();
  });

  test('it opens flush below its abbreviation, inside a 320px viewport', async ({
    page,
  }) => {
    await page.setViewportSize(NARROW);
    await gotoSettled(page, TIP_ROUTE);
    await abbrReady(page);
    for (const button of await page.locator('main .abbr-trigger').all()) {
      await button.click();
      const tip = button.locator('xpath=..').locator('.abbr-tip');
      /* Polled: a smooth scroll to the button can still be settling, and the tip follows it. */
      await expect
        .poll(
          async () => {
            const box = await tip.boundingBox();
            const anchor = await button.boundingBox();
            return box && anchor
              ? Math.abs(box.y - (anchor.y + anchor.height))
              : Infinity;
          },
          {
            message:
              'a gap or overlap sits between the abbreviation and its expansion.',
          },
        )
        .toBeLessThanOrEqual(SUBPIXEL_PX);
      const box = (await tip.boundingBox())!;
      expect(box.x, 'the expansion starts off screen.').toBeGreaterThanOrEqual(
        0,
      );
      expect(
        box.x + box.width,
        'the expansion runs past the viewport.',
      ).toBeLessThanOrEqual(NARROW.width);
      await page.keyboard.press('Escape');
    }
  });
});

test('no built page abbreviates what it can spell out', NODE, () => {
  const offenders = builtPages().flatMap(({ route, file }) => {
    const html = readFileSync(file, 'utf8');
    return SPELLED_OUT.filter(({ pattern }) => pattern.test(html)).map(
      ({ pattern, word }) => `${route}: ${pattern.source}, write "${word}"`,
    );
  });
  expect(offenders, 'abbreviations left in the build').toEqual([]);
});

test('functional pages use no abbreviation outside FIRST_USES', NODE, () => {
  const pages = builtHtml();
  const unlisted = FUNCTIONAL_ROUTES.flatMap((route) => {
    const html = pages.get(route);
    if (html === undefined) return [`${route} was not built`];
    const listed = new Set(
      FIRST_USES.filter((entry) => entry.route === route).map(
        (entry) => entry.abbreviation,
      ),
    );
    const text = NAMES.reduce(
      (rest, name) => rest.replaceAll(name, ' '),
      mainText(html),
    );
    return [...new Set(text.match(ABBREVIATION) ?? [])]
      .filter((token) => !HEX_COLOUR.test(token) && !listed.has(token))
      .map((token) => `${route}: ${token}`);
  });
  expect(
    unlisted,
    'expand each at its first use and list it in FIRST_USES, or add a name to NAMES',
  ).toEqual([]);
});
