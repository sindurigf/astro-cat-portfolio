import { expect, test, type Page } from './test';
import { NON_TEXT, PAGE_HELPERS } from './contrast';
import { gotoSettled } from './settle';
import { FOCUSABLE_SELECTOR, NARROW_WIDTH } from './wcag';
import { settleFocusScroll, tabWalk } from './tab-walk';
import { SAMPLED_ROUTES } from './routes';

/**
 * SC 2.4.7, 2.4.11 and 2.4.13 both ways at two widths; Shift-Tab aligns the control under
 * the sticky header. Hit-testing, as the skip link overlaps the header (`z-60`).
 * `scroll-padding-top` on `html`: WebKit ignores `scroll-margin-top` on text inputs.
 */
const WIDTHS = [
  { width: NARROW_WIDTH, height: 720, note: '400% zoom, classic scrollbar' },
  { width: 1280, height: 900, note: 'desktop' },
] as const;

/**
 * Ceiling for a focus trap; reaching it fails. Largest walk measured: 67 stops,
 * with headroom because new posts add stops.
 */
const MAX_STOPS = 300;

/*
 * Per step, scaled by control count. `/` has few controls and an animated
 * HeroField canvas; webkit under load measured up to 441ms a step there.
 */
const WALK_BUDGET_PER_STEP_MS = 600;
const WALK_DIRECTIONS = 2;

interface Stop {
  selector: string;
  text: string;
  /** Probe points that had something else painted on top. */
  covered: number;
  probed: number;
  /** What was on top, if anything. */
  by: string | null;
  /** Probe points under the sticky header. */
  underHeader: number;
  hasRing: boolean;
  outline: string;
  outlineStyle: string;
  /** Ring pixels painted, after any clipping ancestor (SC 2.4.13). */
  area: number;
  /** A 2px perimeter of the unfocused control, 4(w + h) per line box. */
  perimeter: number;
  /** The ring measured against what is painted in the offset gap. */
  ratio: number | null;
  behind: string | null;
}

const FOCUS_LABEL = `
    /* Not \`describe\`: PAGE_HELPERS declares one, and a duplicate const is a SyntaxError. */
    const label = (node) => {
      const cls =
        typeof node.className === 'string' && node.className.trim() !== ''
          ? '.' + node.className.trim().split(/\\s+/).slice(0, 2).join('.')
          : '';
      return node.tagName.toLowerCase() + cls;
    };
`;

const FOCUS_PROBE = `
    const probeCover = (el, rect) => {
      /* Four corners and the center, inset 2px to land on the element itself. */
      const points = [
        [rect.left + 2, rect.top + 2],
        [rect.right - 2, rect.top + 2],
        [rect.left + 2, rect.bottom - 2],
        [rect.right - 2, rect.bottom - 2],
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
      ];

      let covered = 0;
      let probed = 0;
      let by = null;
      let underHeader = 0;
      const header = document.querySelector('body > header');

      for (const [x, y] of points) {
        // A point outside the viewport is not evidence either way.
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
          continue;
        }
        probed += 1;

        const hit = document.elementFromPoint(x, y);
        if (hit === null) {
          covered += 1;
          continue;
        }
        // The element, a descendant, or an ancestor painting behind it.
        if (el.contains(hit) || hit.contains(el)) continue;

        covered += 1;
        if (header && header.contains(hit)) underHeader += 1;
        if (by === null) by = label(hit);
      }
      return { covered, probed, by, underHeader };
    };
`;

const FOCUS_RING = `
    /*
     * SC 1.4.11: the ring sits in the offset gap, so it is measured against the
     * ground behind the control, not its fill (gold on gold is 1.00:1).
     */
    const ringContrast = (el, style) => {
      let ringRatio = null;
      let ringBehind = null;
      const offset = parseFloat(style.outlineOffset) || 0;
      const ground = compositeBackground(
        offset > 0 ? el.parentElement || el : el,
      );
      const ring = parse(style.outlineColor);
      if (ground && ring) {
        ringBehind =
          'rgb(' + Math.round(ground.r) + ', ' + Math.round(ground.g) +
          ', ' + Math.round(ground.b) + ')';
        ringRatio = ratio(over(ring, ground), ground);
      }
      return { ringRatio, ringBehind };
    };
`;

const FOCUS_AREA = `
    /* Padding boxes of ancestors that clip; html and body hand overflow to the viewport. */
    const clipOf = (el) => {
      let clip = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const s = getComputedStyle(node);
        if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
        const r = node.getBoundingClientRect();
        clip = {
          left: Math.max(clip.left, r.left + parseFloat(s.borderLeftWidth)),
          top: Math.max(clip.top, r.top + parseFloat(s.borderTopWidth)),
          right: Math.min(clip.right, r.right - parseFloat(s.borderRightWidth)),
          bottom: Math.min(clip.bottom, r.bottom - parseFloat(s.borderBottomWidth)),
        };
      }
      return clip;
    };

    const grow = (r, by) => ({
      left: r.left - by, top: r.top - by, right: r.right + by, bottom: r.bottom + by,
    });

    const areaWithin = (r, clip) =>
      Math.max(0, Math.min(r.right, clip.right) - Math.max(r.left, clip.left)) *
      Math.max(0, Math.min(r.bottom, clip.bottom) - Math.max(r.top, clip.top));

    /* The outline band between offset and offset + width, around each line box. */
    const ringArea = (el, style) => {
      const width = parseFloat(style.outlineWidth) || 0;
      const offset = parseFloat(style.outlineOffset) || 0;
      const clip = clipOf(el);
      let area = 0;
      let perimeter = 0;
      for (const rect of el.getClientRects()) {
        if (rect.width === 0 && rect.height === 0) continue;
        area += areaWithin(grow(rect, offset + width), clip) - areaWithin(grow(rect, offset), clip);
        perimeter += 4 * (rect.width + rect.height);
      }
      return { area, perimeter };
    };
`;

/** Read while focused: an outline read after blur is the resting value. */
const readFocused = (page: Page): Promise<Stop> =>
  page.evaluate(`(() => {
    ${PAGE_HELPERS}
    ${FOCUS_LABEL}
    ${FOCUS_PROBE}
    ${FOCUS_RING}
    ${FOCUS_AREA}

    const el = document.activeElement;
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);

    const { covered, probed, by, underHeader } = probeCover(el, rect);

    const hasRing =
      style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;

    const { ringRatio, ringBehind } = hasRing
      ? ringContrast(el, style)
      : { ringRatio: null, ringBehind: null };

    const { area, perimeter } = hasRing
      ? ringArea(el, style)
      : { area: 0, perimeter: 0 };

    return {
      selector: label(el),
      text: (el.textContent ?? '').trim().replace(/\\s+/g, ' ').slice(0, 36),
      covered,
      probed,
      by,
      underHeader,
      hasRing,
      outline:
        style.outlineStyle + ' ' + style.outlineWidth + ' ' + style.outlineColor,
      outlineStyle: style.outlineStyle,
      area,
      perimeter,
      ratio: ringRatio,
      behind: ringBehind,
    };
  })()`) as Promise<Stop>;

interface Coverage {
  focusable: number;
  visited: number;
  /** Matches the selector, and the walk never focused it. */
  unreached: string[];
  /** The walk focused it, and the selector does not match it. */
  extra: string[];
}

/**
 * Non-vacuity: a full walk visits exactly the visible focusable elements.
 * `unreached` is an SC 2.1.1 problem; `extra` means FOCUSABLE_SELECTOR went narrow.
 */
const walkCoverage = (page: Page, selector: string): Promise<Coverage> =>
  page.evaluate((sel) => {
    const visited = window.__tabWalk?.visited ?? [];

    const describe = (el: Element): string => {
      const id = el.id ? `#${el.id}` : '';
      const cls =
        typeof el.className === 'string' && el.className.trim() !== ''
          ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
          : '';
      const text = (el.textContent ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 40);
      return `${el.tagName.toLowerCase()}${id}${cls} ${JSON.stringify(text)}`;
    };

    /* `checkVisibility`: a closed `<details>` keeps a box but leaves the tab order. */
    const focusable = [...document.querySelectorAll(sel)].filter((el) => {
      const box = el.getBoundingClientRect();
      return (box.width > 0 || box.height > 0) && el.checkVisibility();
    });

    return {
      focusable: focusable.length,
      visited: visited.length,
      unreached: focusable.filter((el) => !visited.includes(el)).map(describe),
      extra: visited.filter((el) => !focusable.includes(el)).map(describe),
    };
  }, selector);

/** Stops until focus returns to an element this walk already visited. */
const walk = (page: Page, key: 'Tab' | 'Shift+Tab'): Promise<Stop[]> =>
  tabWalk(page, () => readFocused(page), {
    key,
    max: MAX_STOPS,
    settle: () => settleFocusScroll(page),
  });

const report = (stops: Stop[]): string =>
  stops
    .map(
      (s) =>
        `  ${s.selector}, "${s.text}", ${s.covered}/${s.probed} points ` +
        `covered${s.by === null ? '' : ` by ${s.by}`}, outline: ${s.outline}`,
    )
    .join('\n');

const walkBothWays = async (page: Page) => {
  /* Forward, from the top of the document. */
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('body').press('Tab');
  const forward = await walk(page, 'Tab');
  const forwardCoverage = await walkCoverage(page, FOCUSABLE_SELECTOR);

  /* Backward: the direction that lands controls under the sticky header. */
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.locator('footer a').last().focus();
  const backward = await walk(page, 'Shift+Tab');
  const backwardCoverage = await walkCoverage(page, FOCUSABLE_SELECTOR);

  return {
    stops: [...forward, ...backward],
    coverages: [
      ['forward', forwardCoverage],
      ['backward', backwardCoverage],
    ] as const,
  };
};

const expectFullCoverage = (
  route: string,
  width: number,
  direction: string,
  coverage: Coverage,
): void => {
  expect(
    coverage.unreached,
    `${route} at ${width}px has control(s) the ${direction} walk never reached (SC 2.1.1), ${coverage.visited} of ${coverage.focusable} visited:\n` +
      coverage.unreached.map((entry) => `  ${entry}`).join('\n'),
  ).toEqual([]);

  expect(
    coverage.extra,
    `${route} at ${width}px focused control(s) FOCUSABLE_SELECTOR does not match:\n` +
      coverage.extra.map((entry) => `  ${entry}`).join('\n'),
  ).toEqual([]);
};

/*
 * SC 2.4.11 (Minimum): not entirely hidden. A focused control with no probe
 * point in the viewport is off the left edge or clipped, where no scroll reaches.
 */
const expectNoneHidden = (route: string, width: number, stops: Stop[]) => {
  const hidden = stops.filter((s) => s.probed === 0 || s.covered === s.probed);
  expect(
    hidden,
    `${route} at ${width}px has focused control(s) completely hidden or outside the viewport (SC 2.4.11); check scroll-padding-top on html:\n${report(hidden)}`,
  ).toEqual([]);
};

/* SC 2.4.12 (Enhanced): no part of a focused control under the sticky header. */
const expectNoneUnderHeader = (route: string, width: number, stops: Stop[]) => {
  const under = stops.filter((s) => s.underHeader > 0);
  expect(
    under,
    `${route} at ${width}px has focused control(s) partly under the sticky header (SC 2.4.12):\n${report(under)}`,
  ).toEqual([]);
};

/* SC 2.4.7: every stop has an indicator. */
const expectAllMarked = (route: string, width: number, stops: Stop[]) => {
  const unmarked = stops.filter((s) => !s.hasRing);
  expect(
    unmarked,
    `${route} at ${width}px has focused control(s) with no focus indicator (SC 2.4.7):\n${report(unmarked)}`,
  ).toEqual([]);
};

/*
 * SC 1.4.11: present is not enough. A null ratio (image or gradient behind the
 * control) is skipped; `hasRing` still covers it.
 */
const expectRingsContrast = (route: string, width: number, stops: Stop[]) => {
  const dim = stops.filter(
    (s) => s.hasRing && s.ratio !== null && s.ratio < NON_TEXT,
  );
  expect(
    dim,
    `${route} at ${width}px has focus indicator(s) below ${NON_TEXT}:1 against their ground (SC 1.4.11):\n` +
      dim
        .map(
          (s) =>
            `  ${s.selector} ${JSON.stringify(s.text)}\n` +
            `    outline: ${s.outline}\n` +
            `    behind:  ${s.behind}\n` +
            `    ratio:   ${s.ratio?.toFixed(2)}:1`,
        )
        .join('\n'),
  ).toEqual([]);
};

/*
 * SC 2.4.13 Focus Appearance: a solid ring at least as large as a 2px perimeter
 * of the control. Its change of contrast is the ring against the ground it
 * replaces, which expectRingsContrast holds at 3:1.
 */
const expectRingsLargeEnough = (
  route: string,
  width: number,
  stops: Stop[],
) => {
  const small = stops.filter(
    (s) => s.hasRing && (s.outlineStyle !== 'solid' || s.area < s.perimeter),
  );
  expect(
    small,
    `${route} at ${width}px has focus indicator(s) smaller than a 2px perimeter or not solid (SC 2.4.13):\n` +
      small
        .map(
          (s) =>
            `  ${s.selector} ${JSON.stringify(s.text)}, outline: ${s.outline}, ` +
            `${Math.round(s.area)} px painted against ${Math.round(s.perimeter)}`,
        )
        .join('\n'),
  ).toEqual([]);
};

/* light-mode.css swaps the focus color, so the rings are measured in both. */
const SCHEMES = ['dark', 'light'] as const;

for (const colorScheme of SCHEMES) {
  for (const { width, height, note } of WIDTHS) {
    test.describe(`keyboard flow at ${width}px (${note}), ${colorScheme}`, () => {
      test.use({ colorScheme, viewport: { width, height } });

      for (const route of SAMPLED_ROUTES) {
        test(`${route} keeps every focused control visible`, async ({
          page,
        }) => {
          const response = await gotoSettled(page, route);
          expect(response?.status(), `${route} should serve a 200`).toBe(200);

          const controls = await page.locator(FOCUSABLE_SELECTOR).count();
          test.setTimeout(
            Math.max(
              test.info().timeout,
              controls * WALK_DIRECTIONS * WALK_BUDGET_PER_STEP_MS,
            ),
          );

          const { stops, coverages } = await walkBothWays(page);

          for (const [direction, coverage] of coverages) {
            expectFullCoverage(route, width, direction, coverage);
          }

          expectNoneHidden(route, width, stops);
          expectNoneUnderHeader(route, width, stops);
          expectAllMarked(route, width, stops);
          expectRingsContrast(route, width, stops);
          expectRingsLargeEnough(route, width, stops);
        });
      }
    });
  }
}

/* SC 2.4.1: the skip link moves focus, not only the scroll position. */
test.describe('skip link', () => {
  for (const route of SAMPLED_ROUTES) {
    test(`${route} skips to the main content`, async ({ page }) => {
      await gotoSettled(page, route);
      await page.locator('body').press('Tab');
      const skip = page.locator('a.skip-link');
      await expect(
        skip,
        'the first Tab should reach the skip link',
      ).toBeFocused();
      await skip.press('Enter');
      await expect(
        page.locator('main#main-content'),
        'Enter on the skip link should focus <main>',
      ).toBeFocused();
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(
          () => document.activeElement?.closest('main') !== null,
        ),
        'the next Tab should land inside <main>, not back in the header',
      ).toBe(true);
    });
  }
});
