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

    test(`${route} reads each expansion inline without JavaScript`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await gotoSettled(page, route);

      for (const { abbreviation, expansion } of FIRST_USES.filter(
        (entry) => entry.route === route,
      )) {
        const tip = page.locator('main [data-abbr] .abbr-tip', {
          hasText: expansion,
        });
        await expect(
          tip.first(),
          `${route} hides the expansion of ${abbreviation} without JavaScript.`,
        ).toBeVisible();
      }
      await context.close();
    });
  }
});

test.describe('an abbreviation shows its expansion on demand (SC 3.1.4, 1.4.13)', () => {
  const trigger = (page: Page) =>
    page.getByRole('button', { name: TIP_ABBREVIATION, exact: true });
  const tip = (page: Page) =>
    page.locator('[data-abbr]', { has: trigger(page) }).locator('.abbr-tip');

  test.beforeEach(async ({ page }) => {
    await gotoSettled(page, TIP_ROUTE);
  });

  test('keyboard focus shows it and Escape hides it', async ({ page }) => {
    await trigger(page).focus();
    await expect(tip(page), 'focus does not show the expansion.').toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tip(page), 'Escape does not hide the expansion.').toBeHidden();
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('a tap shows it until a second tap', async ({ page }) => {
    await trigger(page).click();
    await expect(tip(page), 'a tap does not show the expansion.').toBeVisible();
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
    await trigger(page).click();
    await expect(tip(page), 'a second tap does not hide it.').toBeHidden();
  });

  test('it stays while the pointer moves onto it, and goes when it leaves', async ({
    page,
  }) => {
    await trigger(page).hover();
    await expect(tip(page), 'hover does not show the expansion.').toBeVisible();
    await tip(page).hover();
    await expect(
      tip(page),
      'the expansion vanishes when the pointer moves onto it (SC 1.4.13 hoverable).',
    ).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(
      tip(page),
      'the expansion stays after the pointer leaves.',
    ).toBeHidden();
  });

  test('it opens below its abbreviation, inside a 320px viewport', async ({
    page,
  }) => {
    await page.setViewportSize(NARROW);
    await gotoSettled(page, TIP_ROUTE);
    for (const button of await page.locator('main .abbr-trigger').all()) {
      await button.click();
      const root = page.locator('[data-abbr]', { has: button });
      const box = await root.locator('.abbr-tip').boundingBox();
      const anchor = await button.boundingBox();
      expect(box, 'the expansion did not open.').not.toBeNull();
      expect(
        box!.y,
        'the expansion covers its own abbreviation.',
      ).toBeGreaterThanOrEqual(anchor!.y + anchor!.height - 1);
      expect(box!.x, 'the expansion starts off screen.').toBeGreaterThanOrEqual(
        0,
      );
      expect(
        box!.x + box!.width,
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
