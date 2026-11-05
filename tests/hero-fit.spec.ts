import { test, expect, type Page } from './test';
import { fontsSettled } from './settle';
import { TEXT_SPACING_OVERRIDE } from './wcag';

// 200% text-only zoom is a by-hand check (docs/MANUAL_TESTING.md section 7):
// Playwright's zoom scales `svh` with it.

/** [width, height]: 305x568 is the tightest sticker gap on a phone; landscape phones have least room above the fold. */
const VIEWPORTS = [
  [1920, 1080],
  [1280, 720],
  [1024, 640],
  [768, 1024],
  [844, 390],
  [667, 375],
  [390, 844],
  [305, 568],
] as const;

/** 400% zoom of 1280x900 and 1280x1024, and short landscape windows where only one sticker fits. */
const SHORT_WINDOWS = [
  [320, 225],
  [320, 256],
  [568, 320],
  [600, 300],
  [1280, 300],
] as const;

/** CSS px. Boxes are fractional and the stickers tilt three degrees; half a pixel hides no mark. */
const SUBPIXEL_TOLERANCE = 0.5;

const openHero = async (page: Page): Promise<void> => {
  await page.goto('/', { waitUntil: 'load' });
  await fontsSettled(page);
};

const HERO_PARTS = `
    const heroParts = () => {
      const hero = document.querySelector('section.hero');
      const windowEl = document.querySelector('.hero-window');
      const plate = document.querySelector('.hero-plate');
      if (!hero || !windowEl || !plate) {
        throw new Error(
          'the homepage hero is missing its section, window or name.',
        );
      }
      return { hero, windowEl, plate };
    };
`;

/**
 * The name is centered on the window's top rule, so half of it sits above the
 * section's box and can slide under the 104px sticky header.
 */
const HIGHEST_EDGE = `
    const highestEdge = () => {
      const { plate } = heroParts();
      const lines = [...plate.querySelectorAll('span')];
      if (lines.length === 0) throw new Error('the hero name has no lines to measure.');
      return Math.min(...lines.map((l) => l.getBoundingClientRect().top));
    };
`;

test.describe('the homepage hero fits the screen it opens on', () => {
  for (const [width, height] of VIEWPORTS) {
    test(`the name clears the header at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openHero(page);

      const covered = await page.evaluate(
        `(() => {
          ${HERO_PARTS}
          ${HIGHEST_EDGE}
          const header = document.querySelector('header');
          return header.getBoundingClientRect().bottom - highestEdge();
        })()`,
      );

      expect(
        covered,
        `the sticky header covers the top of the name by ` +
          `${Math.round(Number(covered))}px at ${width}x${height}`,
      ).toBeLessThanOrEqual(SUBPIXEL_TOLERANCE);
    });
  }

  for (const [width, height] of VIEWPORTS) {
    test(`the hero grows instead of clipping at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openHero(page);
      await page.addStyleTag({ content: TEXT_SPACING_OVERRIDE });

      const clipped = await page.evaluate(
        `(() => {
          ${HERO_PARTS}
          const { hero, windowEl, plate } = heroParts();
          const box = windowEl.getBoundingClientRect();
          const name = plate.getBoundingClientRect();
          const floor = hero.getBoundingClientRect().bottom;
          const past = [...hero.querySelectorAll('*')].reduce(
              (worst, el) =>
                Math.max(worst, el.getBoundingClientRect().bottom - floor),
              0,
            );
          return {
            heroClips: Math.round(past),
            nameWider: Math.round(name.width - box.width),
          };
        })()`,
      );

      const result = clipped as { heroClips: number; nameWider: number };

      expect(
        result.heroClips,
        `the hero clips its own content by ${result.heroClips}px under the ` +
          `text-spacing override at ${width}x${height}`,
      ).toBeLessThanOrEqual(SUBPIXEL_TOLERANCE);
      expect(
        result.nameWider,
        `the name is ${result.nameWider}px wider than the window under the ` +
          `text-spacing override at ${width}x${height}`,
      ).toBeLessThanOrEqual(0);
    });
  }
});

/*
 * `translateY(-50%)` puts the break on the rule only while the name is exactly two
 * lines; a third line puts one line on a ground at 1.00 or 1.27 contrast.
 */
test.describe('the name breaks on the column rule', () => {
  for (const [width, height] of VIEWPORTS) {
    test(`the name is two lines at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openHero(page);

      const measured = await page.evaluate(
        `(() => {
          ${HERO_PARTS}
          const { plate } = heroParts();
          const column = document.querySelector('.v-column');
          const spans = [...plate.querySelectorAll('span')];
          const style = getComputedStyle(spans[1]);
          const size = parseFloat(style.fontSize);
          const lineHeight = parseFloat(style.lineHeight);
          const top = column.getBoundingClientRect().top;
          const ring = Number(
            getComputedStyle(column).boxShadow.match(/(-?[\\d.]+)px/g)[3].slice(0, -2),
          );
          const band = {
            top: top - ring,
            bottom: top + parseFloat(getComputedStyle(column).borderTopWidth),
          };
          const ink = document.createElement('canvas').getContext('2d');
          ink.font = style.fontWeight + ' ' + size + 'px ' + style.fontFamily;
          const metrics = spans.map((s) => ink.measureText(s.textContent.toUpperCase()));
          const baseline = (box, m) =>
            box.top +
            (lineHeight - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2 +
            m.fontBoundingBoxAscent;
          const [first, second] = spans.map((s) => s.getBoundingClientRect());
          return {
            lines: spans.map((s) =>
              Math.round(s.getBoundingClientRect().height / lineHeight),
            ),
            firstOffColumn: first.bottom <= top,
            secondInColumn: second.top >= top,
            inkAbove:
              band.top -
              (baseline(first, metrics[0]) + metrics[0].actualBoundingBoxDescent),
            inkBelow:
              baseline(second, metrics[1]) -
              metrics[1].actualBoundingBoxAscent -
              band.bottom,
          };
        })()`,
      );

      const { lines, firstOffColumn, secondInColumn, inkAbove, inkBelow } =
        measured as {
          lines: number[];
          firstOffColumn: boolean;
          secondInColumn: boolean;
          inkAbove: number;
          inkBelow: number;
        };

      expect(
        lines,
        `the name wraps (${lines.join(' and ')} lines) at ${width}x${height}, onto a ground its color fails against.`,
      ).toEqual([1, 1]);
      // The column paints gold under its own border, so the first line's box ends above the
      // column's outer edge, or a box-based read (tests/contrast.ts) finds 1.27 on gold.
      expect(
        [firstOffColumn, secondInColumn],
        `the first name's line box should end above the column and the second's start ` +
          `inside it at ${width}x${height}.`,
      ).toEqual([true, true]);
      // The rule is a band (edge plus shadow ring). Letters are measured from font
      // metrics: line-box leading hides a band cutting the glyphs.
      expect(
        Math.min(inkAbove, inkBelow),
        `a letter of the name is inside the rule at ${width}x${height}: ` +
          `${inkAbove.toFixed(1)}px above it and ${inkBelow.toFixed(1)}px below it.`,
      ).toBeGreaterThanOrEqual(0);
    });
  }
});

// The marks sit in `--hero-marks-reserve` at the window's top right, which the
// name stops short of; below `sm` they drop under its second line.
test.describe('the marks on the window do not collide', () => {
  for (const [width, height] of VIEWPORTS) {
    test(`no sticker covers the name at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openHero(page);

      const hits = await page.evaluate(
        `(() => {
          ${HERO_PARTS}
          const { plate } = heroParts();
          const spans = [...plate.querySelectorAll('span')].map((s) =>
            s.getBoundingClientRect(),
          );
          return [...document.querySelectorAll('.hero-sticker')]
            .map((el) => {
              const s = el.getBoundingClientRect();
              const over = spans.find((n) => {
                const x = Math.min(s.right, n.right) - Math.max(s.left, n.left);
                const y = Math.min(s.bottom, n.bottom) - Math.max(s.top, n.top);
                return x > 0 && y > 0;
              });
              return over
                ? '"' + el.textContent.trim() + '" is over the name'
                : null;
            })
            .filter((hit) => hit !== null);
        })()`,
      );

      expect(
        hits,
        `a sticker and the name overlap at ${width}x${height}: ` +
          (hits as string[]).join('; '),
      ).toEqual([]);
    });
  }

  /* SC 1.4.10: at 400% zoom the window is shorter than the stickers; what does not fit is clipped, never over text. */
  for (const [width, height] of SHORT_WINDOWS) {
    test(`no visible sticker covers text at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openHero(page);

      const hits = (await page.evaluate(`(() => {
        const clip = document.querySelector('.hero-marks').getBoundingClientRect();
        const shown = [...document.querySelectorAll('.hero-sticker')]
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { name: el.textContent.trim(), left: Math.max(r.left, clip.left), right: Math.min(r.right, clip.right), top: Math.max(r.top, clip.top), bottom: Math.min(r.bottom, clip.bottom) };
          })
          .filter((r) => r.right - r.left > ${SUBPIXEL_TOLERANCE} && r.bottom - r.top > ${SUBPIXEL_TOLERANCE});
        const hits = [];
        const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.data.trim() || node.parentElement.closest('.hero-marks, .sr-only')) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const box of range.getClientRects())
            for (const s of shown) {
              const x = Math.min(s.right, box.right) - Math.max(s.left, box.left);
              const y = Math.min(s.bottom, box.bottom) - Math.max(s.top, box.top);
              if (x > ${SUBPIXEL_TOLERANCE} && y > ${SUBPIXEL_TOLERANCE}) hits.push('"' + s.name + '" covers "' + node.data.trim().slice(0, 30) + '"');
            }
        }
        return [...new Set(hits)];
      })()`)) as string[];

      expect(hits, `a sticker covers text at ${width}x${height}`).toEqual([]);
    });
  }

  for (const [width, height] of SHORT_WINDOWS) {
    test(`each sticker shows whole or not at all at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openHero(page);

      const cut = (await page.evaluate(`(() => {
        const clip = document.querySelector('.hero-marks').getBoundingClientRect();
        return [...document.querySelectorAll('.hero-sticker')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            const x = Math.min(r.right, clip.right) - Math.max(r.left, clip.left);
            const y = Math.min(r.bottom, clip.bottom) - Math.max(r.top, clip.top);
            const shown = Math.max(0, x) * Math.max(0, y);
            return shown > ${SUBPIXEL_TOLERANCE} && shown < r.width * r.height - ${SUBPIXEL_TOLERANCE};
          })
          .map((el) => el.textContent.trim());
      })()`)) as string[];

      expect(
        cut,
        `a sticker shows part of its word at ${width}x${height}`,
      ).toEqual([]);
    });
  }

  // The walks above pass trivially on a page with no stickers.
  test('the stickers actually render', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openHero(page);

    const drawn = await page.evaluate(
      `[...document.querySelectorAll('.hero-sticker')].filter(
        (el) => el.getBoundingClientRect().width > 0,
      ).length`,
    );

    expect(drawn, 'the hero should render both brand words').toBe(2);
  });
});
