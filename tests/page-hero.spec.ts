import { expect, test, type Page } from './test';
import { builtHtml, POST_ROUTES, ROUTES, TALK_ROUTES } from './routes';
import { gotoSettled } from './settle';
import { NODE } from './tags';

/**
 * PageHero's roundel and photo cover no text in the hero or the next section, and in forced
 * colours the slab's bottom border still separates it from what follows.
 */

/** Home keeps its canvas hero, a post its article, a talk its cover slide. */
const HERO_ROUTES = ROUTES.filter(
  (route) => !['/', ...POST_ROUTES, ...TALK_ROUTES].includes(route),
);

/**
 * Opening per route (docs/STYLEGUIDE.md "The slab tiers"). Listed, not derived,
 * because a walk that finds nothing passes; the censuses below hold them to the build.
 */
const FULL_ROUTES = [
  '/about',
  '/career',
  '/contact',
  '/blog',
  '/credits',
] as const;
const THIN_ROUTES = ['/contact/sent'] as const;
const PLAIN_ROUTES = HERO_ROUTES.filter(
  (route) =>
    !(FULL_ROUTES as readonly string[]).includes(route) &&
    !(THIN_ROUTES as readonly string[]).includes(route),
);

/** Every route whose opening is a gold slab, thin or full. */
const GOLD_ROUTES = [...FULL_ROUTES, ...THIN_ROUTES];

/** A gold slab with a photo has no roundel; a post's slab has one. */
const PHOTO_ROUTES: readonly string[] = ['/about'];
const GOLD_ROUNDEL_ROUTES = [
  ...GOLD_ROUTES.filter((route) => !PHOTO_ROUTES.includes(route)),
  ...POST_ROUTES,
];

test('the slab census matches the build', NODE, () => {
  const plainFromBuild = [...builtHtml()]
    .filter(
      ([route, html]) =>
        (HERO_ROUTES as readonly string[]).includes(route) &&
        /class="[^"]*\bpage-hero-plain\b/.test(html),
    )
    .map(([route]) => route)
    .sort();
  expect(
    plainFromBuild,
    'a route changed slab tier without updating this file',
  ).toEqual([...PLAIN_ROUTES].sort());
});

test('the roundel census matches the build', NODE, () => {
  const fromBuild = [...builtHtml()]
    .filter(([, html]) => html.includes('hero-roundel'))
    .map(([route]) => route)
    .sort();
  expect(
    fromBuild,
    'a route gained or lost its hero roundel without updating this file',
  ).toEqual([...GOLD_ROUNDEL_ROUTES, ...PLAIN_ROUTES].sort());
});

test.describe('the gold slab in forced colours', () => {
  test.use({ viewport: { width: 320, height: 900 } });

  for (const route of GOLD_ROUTES) {
    test(`${route} keeps a bottom border to separate the slab`, async ({
      page,
    }) => {
      // `emulateMedia`, not `test.use({ forcedColors })`; see tests/forced-colors.spec.ts.
      await page.emulateMedia({ forcedColors: 'active' });
      await gotoSettled(page, route);
      const found = await page.evaluate(() => {
        const slab = document.querySelector('main .page-hero.gold-column');
        return {
          forced: matchMedia('(forced-colors: active)').matches,
          border: slab
            ? parseFloat(getComputedStyle(slab).borderBottomWidth)
            : null,
        };
      });
      expect(found.forced, 'forced colours did not take effect').toBe(true);
      expect(found.border, `${route} has no gold slab`).not.toBeNull();
      expect(found.border!, 'the slab bottom border').toBeGreaterThan(0);
    });
  }
});

/** Text a hero mark's box overlaps in the hero and the next section, or null without the mark. */
const markOverlaps = (page: Page, mark: string) =>
  page.evaluate((selector) => {
    const hero = document.querySelector('main .page-hero, main .post-slab');
    const holder = hero?.querySelector(selector);
    if (!hero || !holder) return null;
    const d = holder.getBoundingClientRect();
    const hits: string[] = [];
    for (const root of [hero, hero.nextElementSibling]) {
      if (!root) continue;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.textContent ?? '').trim();
        if (text === '' || holder.contains(n)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        // Wider than 1px: a visually hidden label is a 1px box, painted nowhere.
        const over = [...range.getClientRects()].some(
          (r) =>
            r.width > 1 &&
            r.height > 1 &&
            r.left < d.right &&
            r.right > d.left &&
            r.top < d.bottom &&
            r.bottom > d.top,
        );
        if (over) hits.push(text.slice(0, 40));
      }
    }
    return hits;
  }, mark);

const roundelOverlaps = (page: Page) => markOverlaps(page, '.hero-roundel');

/* The phone, `sm`, `md`, both sides of `lg`, and a laptop. */
const CLEARANCE_WIDTHS = [320, 640, 768, 1023, 1024, 1280] as const;

for (const width of CLEARANCE_WIDTHS) {
  test.describe(`the gold slab's mark at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const route of GOLD_ROUNDEL_ROUTES) {
      test(`${route} keeps the roundel off the text`, async ({ page }) => {
        await gotoSettled(page, route);
        const overlaps = await roundelOverlaps(page);
        expect(overlaps, `${route} has no hero roundel`).not.toBeNull();
        expect(overlaps, 'text under the roundel').toEqual([]);
      });
    }

    for (const route of PHOTO_ROUTES) {
      test(`${route} keeps the hero photo off the text`, async ({ page }) => {
        await gotoSettled(page, route);
        const overlaps = await markOverlaps(page, '.hero-photo');
        expect(overlaps, `${route} has no hero photo`).not.toBeNull();
        expect(overlaps, 'text under the hero photo').toEqual([]);
      });
    }
  });
}

for (const width of [320, 1023, 1280] as const) {
  test.describe(`the plain opening at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const route of PLAIN_ROUTES) {
      test(`${route} keeps its slab's roundel off the text`, async ({
        page,
      }) => {
        await gotoSettled(page, route);
        await expect(
          page.locator('main .page-hero .plain-slab .hero-roundel'),
          `${route} has no plain slab with a roundel`,
        ).toHaveCount(1);
        expect(await roundelOverlaps(page), 'text under the roundel').toEqual(
          [],
        );
      });
    }
  });
}
