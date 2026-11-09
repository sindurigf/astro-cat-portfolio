import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './test';
import { captures } from './captures';
import { gotoSettled } from './settle';
import { AAA_TEXT, NON_TEXT, PAGE_HELPERS } from './contrast';
import { builtPages, CONTENTS_POST_ROUTE, DIST_DIR } from './routes';
import { NODE, NO_WEBKIT } from './tags';
import { DESKTOP_VIEWPORT, NARROW_WIDTH, PHONE_VIEWPORT } from './wcag';

/**
 * Blocks (src/styles/components/cards.css): every card, the plain hero slab
 * and the post contents, gold or light with an ink edge. Inside, the color
 * tokens are remapped, so each block is measured as a ground of its own.
 */
const BLOCK =
  ':is(.card, .plain-slab, .post-contents):not(.surface-gold *, :is(.card, .plain-slab, .post-contents) *)';

/* Every kind of block: card blocks, a lone card, a hero slab, the contents, a form. */
const BLOCK_ROUTES = [
  '/',
  '/blog',
  '/about',
  '/career',
  '/contact',
  '/accessibility',
  ...(CONTENTS_POST_ROUTE ? [CONTENTS_POST_ROUTE] : []),
  '/brand',
];
/* A few links per page cover each block kind in reasonable time. */
const LINKS_PER_PAGE = 6;
/* Pages with text links inside blocks; /brand repeats real cards inside clipped stages. */
const LINK_ROUTES = [
  '/',
  '/blog',
  '/about',
  '/career',
  ...(CONTENTS_POST_ROUTE ? [CONTENTS_POST_ROUTE] : []),
];
const STEP_WIDTHS = [
  DESKTOP_VIEWPORT.width,
  PHONE_VIEWPORT.width,
  NARROW_WIDTH,
] as const;

/*
 * Browsers report false values for `:visited`, so no test can read its ratio.
 * A visited link keeps its rest color; this asserts no rule changes that.
 */
test('no :visited rule exists anywhere in the built CSS', NODE, () => {
  const pages = builtPages().map((page) => readFileSync(page.file, 'utf8'));
  const linked = new Set(
    pages.flatMap((html) => captures(html, /href="([^"]+\.css)"/g)),
  );
  // An unreadable sheet throws; inline <style> counts, since Astro inlines small CSS.
  const sources = [
    ...[...linked].map((href) => ({
      source: href,
      css: readFileSync(`${DIST_DIR}${href}`, 'utf8'),
    })),
    ...pages.flatMap((html, index) =>
      captures(html, /<style\b[^>]*>([\s\S]*?)<\/style>/g).map((css) => ({
        source: `inline style in page ${index}`,
        css,
      })),
    ),
  ];
  expect(linked.size, 'no stylesheet is linked from the build').toBeGreaterThan(
    0,
  );

  const offenders = sources
    .filter(({ css }) => /:visited/.test(css))
    .map(({ source }) => source);
  expect(
    offenders,
    'a :visited rule exists; its ratio cannot be measured, so the site does not style it.',
  ).toEqual([]);
});

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`blocks in ${colorScheme} mode`, () => {
    test.use({ colorScheme });

    for (const route of BLOCK_ROUTES) {
      test(`${route}: every block's edge reaches ${NON_TEXT}:1 and its text ${AAA_TEXT}:1`, async ({
        page,
      }) => {
        await gotoSettled(page, route);
        const found = (await page.evaluate(`(() => {
          ${PAGE_HELPERS}
          /* What is actually behind a text node: a badge paints its own fill. */
          const groundOf = (el) => {
            for (let node = el; node; node = node.parentElement) {
              const c = parse(getComputedStyle(node).backgroundColor);
              if (c && c.a === 1) return c;
            }
            return parse(getComputedStyle(document.body).backgroundColor);
          };
          const blocks = [...document.querySelectorAll(${JSON.stringify(BLOCK)})].filter((b) => b.getClientRects().length);
          const problems = [];
          for (const block of blocks) {
            const cs = getComputedStyle(block);
            const fill = parse(cs.backgroundColor);
            const page = groundOf(block.parentElement);
            const edge = parse(cs.borderTopColor);
            const width = parseFloat(cs.borderTopWidth);
            const edgeRatio = Math.max(
              fill && fill.a === 1 ? ratio(fill, page) : 1,
              width > 0 && edge && edge.a > 0 ? ratio(over(edge, page), page) : 1,
            );
            if (edgeRatio < ${NON_TEXT}) problems.push(describe(block) + ' edge at ' + edgeRatio.toFixed(2));
            for (const el of block.querySelectorAll('*')) {
              const text = [...el.childNodes].some(
                (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
              );
              if (!text || !el.getClientRects().length || el.closest('.sr-only, [aria-hidden="true"]')) continue;
              const ground = groundOf(el);
              const r = ratio(over(parse(getComputedStyle(el).color), ground), ground);
              if (r < ${AAA_TEXT}) problems.push(el.tagName.toLowerCase() + ' "' +
                (el.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 24) + '" at ' + r.toFixed(2));
            }
          }
          return { blocks: blocks.length, problems };
        })()`)) as { blocks: number; problems: string[] };

        expect(
          found.blocks,
          `${route} has no block to measure`,
        ).toBeGreaterThan(0);
        expect(
          found.problems,
          `${route} has a block edge under ${NON_TEXT}:1 or text under ${AAA_TEXT}:1`,
        ).toEqual([]);
      });
    }

    for (const route of LINK_ROUTES) {
      test(`${route}: links in blocks read through hover and focus, rings inside their block`, async ({
        page,
      }) => {
        await gotoSettled(page, route);
        /* Buttons draw their own hover and focus; tests/states.spec.ts covers them. */
        const links = page.locator(
          `${BLOCK} a[href]:not([class*='btn-']):visible`,
        );
        const found = await links.count();
        expect(found, `${route} has no link in a block`).toBeGreaterThan(0);
        const count = Math.min(found, LINKS_PER_PAGE);
        for (let i = 0; i < count; i += 1) {
          const link = links.nth(i);
          await link.scrollIntoViewIfNeeded();
          const read = () =>
            link.evaluate(
              (el, source) => (0, eval)(source)(el),
              `(el) => {
                ${PAGE_HELPERS}
                const block = el.closest(${JSON.stringify(BLOCK)});
                const cs = getComputedStyle(el);
                const ground = effectiveBackground(el) ?? effectiveBackground(block);
                const reach = (parseFloat(cs.outlineWidth) || 0) + (parseFloat(cs.outlineOffset) || 0);
                const a = el.getBoundingClientRect();
                const b = block.getBoundingClientRect();
                return {
                  text: ratio(over(parse(cs.color), ground), ground),
                  ring: ratio(over(parse(cs.outlineColor), ground), ground),
                  state: [cs.color, cs.backgroundColor, cs.textDecorationThickness, getComputedStyle(block).boxShadow].join(' | '),
                  outside: a.left - reach < b.left || a.top - reach < b.top || a.right + reach > b.right || a.bottom + reach > b.bottom,
                };
              }`,
            ) as Promise<{
              text: number;
              ring: number;
              state: string;
              outside: boolean;
            }>;

          const rest = await read();
          expect(rest.text, 'a link at rest in a block').toBeGreaterThanOrEqual(
            AAA_TEXT,
          );
          /* Forced: a sticky menu or smooth scroll can still be settling. */
          await link.hover({ force: true });
          const hovered = await read();
          expect(
            hovered.text,
            `a hovered link is under ${AAA_TEXT}:1 on its block`,
          ).toBeGreaterThanOrEqual(AAA_TEXT);
          expect(
            hovered.state,
            'hovering a link in a block changes nothing (SC 1.4.1)',
          ).not.toBe(rest.state);
          await page.mouse.move(0, 0);
          await link.focus();
          const focused = await read();
          expect(
            focused.ring,
            `a focus ring is under ${NON_TEXT}:1 on its block`,
          ).toBeGreaterThanOrEqual(NON_TEXT);
          expect(
            focused.outside,
            'a focus ring leaves its block, where it meets a stepped neighbour or the page',
          ).toBe(false);
        }
      });
    }
  });
}

test.describe('the Step', () => {
  for (const width of STEP_WIDTHS) {
    test(`no page with blocks scrolls sideways at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: DESKTOP_VIEWPORT.height });
      for (const route of BLOCK_ROUTES) {
        await gotoSettled(page, route);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
          `${route} scrolls sideways at ${width}px`,
        ).toBeLessThanOrEqual(0);
      }
    });
  }

  test('forced colors keep every block edge', NO_WEBKIT, async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    for (const route of ['/', '/blog', '/contact']) {
      await gotoSettled(page, route);
      const edgeless = await page.evaluate(
        (selector) =>
          [...document.querySelectorAll(selector)]
            .filter((b) => b.getClientRects().length)
            .filter((b) => {
              const cs = getComputedStyle(b);
              return (
                cs.borderTopStyle === 'none' ||
                parseFloat(cs.borderTopWidth) === 0
              );
            })
            .map((b) => b.className),
        BLOCK,
      );
      expect(
        edgeless,
        `${route} has a block with no edge in forced colors`,
      ).toEqual([]);
    }
  });
});

/* Every page with a `.card-block`. */
const WALL_ROUTES = ['/', '/blog', '/about', '/career', '/credits'];

interface WallReport {
  walls: number;
  covers: string[];
}

const readWalls = (page: Page): Promise<WallReport> =>
  page.evaluate(() => {
    const report: WallReport = { walls: 0, covers: [] };
    const edge = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        '--block-edge',
      ),
    );
    for (const wall of document.querySelectorAll('main .card-block')) {
      if (!wall.getClientRects().length) continue;
      report.walls += 1;
      const name =
        wall.closest('section')?.querySelector('h2')?.textContent?.trim() ??
        'a wall';
      const rects = [...wall.children].map((brick) =>
        brick.getBoundingClientRect(),
      );
      rects.forEach((a, i) =>
        rects.slice(i + 1).forEach((b, k) => {
          const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (Math.min(across, down) > edge + 0.5)
            report.covers.push(
              `${name}: brick ${i + k + 2} covers brick ${i + 1} by ${Math.round(Math.min(across, down))}px`,
            );
        }),
      );
    }
    return report;
  });

test.describe('card walls', () => {
  for (const width of STEP_WIDTHS) {
    test(`no brick covers another's content at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: DESKTOP_VIEWPORT.height });
      for (const route of WALL_ROUTES) {
        await gotoSettled(page, route);
        const rest = await readWalls(page);
        expect(rest.walls, `${route} has no wall to measure`).toBeGreaterThan(
          0,
        );
        expect(
          rest.covers,
          `${route} has a brick over another's content`,
        ).toEqual([]);
      }
    });
  }
});
