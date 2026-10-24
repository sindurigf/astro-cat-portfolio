import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { AAA_TEXT, NON_TEXT, PAGE_HELPERS } from './contrast';
import {
  builtPages,
  CONTENTS_POST_ROUTE,
  DIST_DIR,
  TALK_ROUTES,
} from './routes';
import { NODE } from './tags';
import { DESKTOP_VIEWPORT, NARROW_WIDTH, PHONE_VIEWPORT } from './wcag';

/**
 * Blocks (src/styles/components/cards.css): every card, the plain hero slab
 * and the post contents, gold or light with an ink edge. Inside, the color
 * tokens are remapped, so each block is measured as a ground of its own.
 */
/* A talk slide is no block, but it is an edged ground of its own, held to the same ratios. */
const BLOCK =
  ':is(.card, .plain-slab, .post-contents, .slide):not(.surface-gold *, :is(.card, .plain-slab, .post-contents) *)';

/* Every kind of block: card blocks, a lone card, a hero slab, the contents, slides, a form. */
const BLOCK_ROUTES = [
  '/',
  '/blog',
  '/about',
  '/career',
  '/contact',
  '/accessibility',
  ...(CONTENTS_POST_ROUTE ? [CONTENTS_POST_ROUTE] : []),
  ...TALK_ROUTES,
  '/brand',
];
/* A few links per page cover each block kind in reasonable time. */
const LINKS_PER_PAGE = 6;
/* /brand repeats real cards inside clipped half-width stages; the real pages carry the link walk. */
const LINK_ROUTES = BLOCK_ROUTES.filter((route) => !route.startsWith('/brand'));
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
    pages.flatMap((html) =>
      [...html.matchAll(/href="([^"]+\.css)"/g)].map((match) => match[1]!),
    ),
  );
  // An unreadable sheet throws; inline <style> counts, since Astro inlines small CSS.
  const sources = [
    ...[...linked].map((href) => ({
      source: href,
      css: readFileSync(`${DIST_DIR}${href}`, 'utf8'),
    })),
    ...pages.flatMap((html, index) =>
      [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((match) => ({
        source: `inline style in page ${index}`,
        css: match[1]!,
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

      test(`${route}: links in blocks read through hover and focus, rings inside their block`, async ({
        page,
      }) => {
        test.skip(
          !LINK_ROUTES.includes(route),
          'a /brand example; the real page walks its links',
        );
        await gotoSettled(page, route);
        /* Buttons draw their own hover and focus; tests/states.spec.ts covers them. */
        const links = page.locator(
          `${BLOCK} a[href]:not([class*='btn-']):visible`,
        );
        const count = Math.min(await links.count(), LINKS_PER_PAGE);
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

  test('forced colors keep every block edge', async ({ page, browserName }) => {
    test.skip(
      browserName === 'webkit',
      'WebKit reports forced colors but paints the author palette (tests/forced-colors.spec.ts)',
    );
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
/** Spacing of the points sampled across a wall, in CSS px. */
const WALL_SAMPLE_PX = 4;
/** Subpixel rounding allowed where two outline samples should agree, in CSS px. */
const OUTLINE_TOLERANCE_PX = 2;

interface WallReport {
  walls: number;
  gaps: string[];
  covers: string[];
  throws: string[];
  stubs: string[];
}

/*
 * The throw falls down and right, so it reads as one outline only while the
 * wall's bottom edge never steps down going right and its right edge never
 * steps out going down; either step ends the throw against a brick face.
 */
const readWalls = (page: Page): Promise<WallReport> =>
  page.evaluate(
    ({ sample, tolerance }) => {
      const report: WallReport = {
        walls: 0,
        gaps: [],
        covers: [],
        throws: [],
        stubs: [],
      };
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
        const bricks = [...wall.children];
        const rects = bricks.map((brick) => brick.getBoundingClientRect());
        if (!getComputedStyle(wall).filter.includes('drop-shadow'))
          report.throws.push(`${name} casts no throw`);
        for (const brick of bricks)
          for (const el of [brick, ...brick.querySelectorAll(':scope > .card')])
            if (getComputedStyle(el).boxShadow !== 'none')
              report.throws.push(`${name}: a brick casts its own throw`);
        rects.forEach((a, i) =>
          rects.slice(i + 1).forEach((b, k) => {
            const across =
              Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (Math.min(across, down) > edge + 0.5)
              report.covers.push(
                `${name}: brick ${i + k + 2} covers brick ${i + 1} by ${Math.round(Math.min(across, down))}px`,
              );
          }),
        );
        const left = Math.min(...rects.map((r) => r.left));
        const right = Math.max(...rects.map((r) => r.right));
        const top = Math.min(...rects.map((r) => r.top));
        const bottom = Math.max(...rects.map((r) => r.bottom));
        const covered = (x: number, y: number) =>
          rects.some(
            (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom,
          );
        for (let y = top + 1; y < bottom - 1; y += sample) {
          let entered = false;
          let crossed = false;
          for (let x = left + 1; x < right - 1; x += sample) {
            const on = covered(x, y);
            if (on && crossed) {
              report.gaps.push(
                `${name}: ground between bricks at ${Math.round(x - left)},${Math.round(y - top)}`,
              );
              break;
            }
            if (on) entered = true;
            else if (entered) crossed = true;
          }
        }
        let lastBottom = -Infinity;
        for (let x = left + 1; x < right - 1; x += sample) {
          let y = bottom;
          while (y > top && !covered(x, y)) y -= 1;
          if (y > lastBottom + tolerance && lastBottom !== -Infinity)
            report.stubs.push(
              `${name}: the bottom edge steps down at ${Math.round(x - left)}px`,
            );
          lastBottom = y;
        }
        let lastRight = -Infinity;
        for (let y = top + 1; y < bottom - 1; y += sample) {
          let x = right;
          while (x > left && !covered(x, y)) x -= 1;
          if (x > lastRight + tolerance && lastRight !== -Infinity)
            report.stubs.push(
              `${name}: the right edge steps out at ${Math.round(y - top)}px`,
            );
          lastRight = x;
        }
      }
      return report;
    },
    { sample: WALL_SAMPLE_PX, tolerance: OUTLINE_TOLERANCE_PX },
  );

test.describe('joined walls', () => {
  for (const width of STEP_WIDTHS) {
    test(`every wall is joined, climbs right and casts one throw at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: DESKTOP_VIEWPORT.height });
      for (const route of WALL_ROUTES) {
        await gotoSettled(page, route);
        const rest = await readWalls(page);
        expect(rest.walls, `${route} has no wall to measure`).toBeGreaterThan(
          0,
        );
        expect(rest.gaps, `${route} shows the page between bricks`).toEqual([]);
        expect(
          rest.covers,
          `${route} has a brick over another's content`,
        ).toEqual([]);
        expect(
          rest.throws,
          `${route} has a throw that is not the wall's own`,
        ).toEqual([]);
        expect(
          rest.stubs,
          `${route} has a throw that ends against a brick face`,
        ).toEqual([]);
        await page
          .locator('main .card-block > *')
          .first()
          .hover({ force: true });
        expect(
          (await readWalls(page)).throws,
          `${route} has a hovered brick that casts its own throw`,
        ).toEqual([]);
      }
    });
  }
});
