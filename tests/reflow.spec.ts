import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { ROUTES, TALK_ROUTES } from './routes';
import {
  FOCUSABLE_SELECTOR,
  NARROW_WIDTH,
  TEXT_SPACING_OVERRIDE,
} from './wcag';

/**
 * SC 1.4.10 and 1.4.12. 305px, not 320: a real browser at 400% zoom leaves 305px
 * beside its scrollbar and no breakpoint changes between the two, so 305 is the
 * stricter case. axe still scans at 320px.
 */
const REFLOW_HEIGHT = 720;

const REFLOW_WIDTHS = [
  {
    width: NARROW_WIDTH,
    contentBox: 273,
    note: 'classic 15px scrollbar, what a real browser gives',
  },
] as const;

/**
 * A horizontal scrollbar above 320px is the same defect. 640px is where `sm`
 * changes the gutter, 768px where the header nav appears, 1024px where grids
 * change columns, 1280px where the column stops growing.
 */
const WIDE_WIDTHS = [640, 768, 1024, 1280, 1920] as const;

/* Sub-pixel rounding at the viewport edge, in CSS px. */
const EDGE_TOLERANCE_PX = 1;

/**
 * Names the element that overflows, so a failure says which heading broke
 * rather than only that the document is 40px too wide.
 */
const overflowReport = async (page: Page): Promise<string> => {
  const offenders = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll('body, body *')) {
      if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 0.5) {
        const text = (el.textContent ?? '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 48);
        out.push(
          `${el.tagName.toLowerCase()}: scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}: "${text}"`,
        );
      }
    }
    return out;
  });

  return offenders.length ? `\n  ${offenders.join('\n  ')}` : '';
};

/**
 * The content box the heading floors are calibrated against, so a gutter change
 * fails here before a heading long enough to overflow the new box exists.
 */
const expectContentBox = async (
  page: Page,
  route: string,
  expected: number,
): Promise<void> => {
  const measured = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return null;
    const style = getComputedStyle(main);
    return (
      main.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight)
    );
  });

  expect(measured, `${route} has no <main> to measure`).not.toBeNull();
  expect(
    measured,
    `${route} content box is ${measured}px, not the ${expected}px the ` +
      `heading floors in global.css are calibrated against`,
  ).toBe(expected);
};

/**
 * `expectNoHorizontalOverflow` cannot catch a floor set too high: base-layer
 * `overflow-wrap: break-word` cuts the word mid-word instead. Words also split on
 * U+00AD, each leading segment measured with the hyphen the break would draw.
 */
const SOFT_HYPHEN = '\u00AD';

const headingWordsWiderThanTheirBox = (softHyphen: string): string[] => {
  const probe = document.createElement('span');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.whiteSpace = 'nowrap';
  probe.style.width = 'max-content';
  document.body.appendChild(probe);

  const out: string[] = [];

  for (const heading of document.querySelectorAll('h1, h2, h3')) {
    const style = getComputedStyle(heading);
    const box =
      heading.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    if (box <= 0) continue;

    probe.style.font = style.font;
    probe.style.letterSpacing = style.letterSpacing;
    probe.style.textTransform = style.textTransform;
    probe.style.fontWeight = style.fontWeight;

    for (const word of (heading.textContent ?? '').split(/\s+/)) {
      if (!word) continue;
      const segments = word.split(softHyphen);
      segments.forEach((segment, i) => {
        if (!segment) return;
        // A break at a soft hyphen paints a hyphen on the leading segment.
        probe.textContent = i < segments.length - 1 ? `${segment}-` : segment;
        const width = probe.getBoundingClientRect().width;
        if (width > box + 0.5) {
          out.push(
            `${heading.tagName.toLowerCase()} at ${style.fontSize}: ` +
              `"${probe.textContent}" is ${width.toFixed(2)}px in a ` +
              `${box.toFixed(2)}px box`,
          );
        }
      });
    }
  }

  probe.remove();
  return out;
};

const expectHeadingWordsFit = async (
  page: Page,
  route: string,
): Promise<void> => {
  const tooWide = await page.evaluate(
    headingWordsWiderThanTheirBox,
    SOFT_HYPHEN,
  );

  expect(
    tooWide,
    `${route} has a heading word wider than its box, so overflow-wrap: ` +
      `break-word is cutting it mid-word with no hyphen. Lower the floor in ` +
      `global.css or give the word a soft hyphen:\n  ${tooWide.join('\n  ')}`,
  ).toEqual([]);
};

const expectNoHorizontalOverflow = async (
  page: Page,
  route: string,
  viewportWidth: number,
  applySpacingOverride: boolean,
): Promise<void> => {
  const response = await gotoSettled(page, route);
  expect(response?.status(), `${route} should serve a 200`).toBe(200);

  if (applySpacingOverride) {
    await page.addStyleTag({ content: TEXT_SPACING_OVERRIDE });
  }

  // Headings are the thing at risk, so measure only after the webfont swaps in.
  await page.evaluate(() => document.fonts.ready);

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(
    scrollWidth,
    `${route} scrolls horizontally at ${viewportWidth}px: ` +
      `scrollWidth ${scrollWidth} > clientWidth ${clientWidth}` +
      (await overflowReport(page)),
  ).toBeLessThanOrEqual(clientWidth);
};

/**
 * Under text spacing a long word in a fixed-layout table spills into the next
 * column without the page scrolling, so the document-level check cannot see it.
 */
const expectCellsHoldTheirText = async (
  page: Page,
  route: string,
): Promise<void> => {
  const spilled = await page.evaluate(() =>
    [...document.querySelectorAll('.prose :is(th, td)')]
      .filter((cell) => cell.scrollWidth > cell.clientWidth + 0.5)
      .map(
        (cell) =>
          `"${(cell.textContent ?? '').trim().slice(0, 40)}": scrollWidth ` +
          `${cell.scrollWidth} > clientWidth ${cell.clientWidth}`,
      ),
  );
  expect(
    spilled,
    `${route} has table text running out of its cell:\n  ${spilled.join('\n  ')}`,
  ).toEqual([]);
};

/*
 * Text and controls wholly or partly past either edge. scrollWidth cannot see
 * the left edge, and a clipped box hides what runs past its own. Anything in a
 * scroll container or a clipping box is skipped: it can be scrolled to.
 */
const expectNothingOffScreen = async (
  page: Page,
  route: string,
): Promise<void> => {
  const off = await page.evaluate(
    ({ selector, tolerance }) => {
      const width = document.documentElement.clientWidth;
      const reachable = (el: Element | null): boolean => {
        for (
          let node = el;
          node && node !== document.body;
          node = node.parentElement
        ) {
          const style = getComputedStyle(node);
          if (style.overflowX !== 'visible' || style.clipPath !== 'none') {
            return false;
          }
          if (style.visibility === 'hidden' || style.display === 'none')
            return false;
        }
        return true;
      };
      const outside = (rect: DOMRect) =>
        rect.width > 0 &&
        rect.height > 0 &&
        (rect.left < -tolerance || rect.right > width + tolerance);
      const out: string[] = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if ((node.textContent ?? '').trim() === '') continue;
        if (!reachable(node.parentElement)) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        if (outside(rect)) {
          out.push(
            `"${node.textContent!.trim().slice(0, 30)}" at ${Math.round(rect.left)}..${Math.round(rect.right)}`,
          );
        }
      }
      for (const el of document.querySelectorAll(selector)) {
        if (!reachable(el)) continue;
        const rect = el.getBoundingClientRect();
        if (outside(rect)) {
          out.push(
            `<${el.tagName.toLowerCase()}> at ${Math.round(rect.left)}..${Math.round(rect.right)}`,
          );
        }
      }
      return out;
    },
    { selector: FOCUSABLE_SELECTOR, tolerance: EDGE_TOLERANCE_PX },
  );
  expect(
    off,
    `${route} has text or controls off screen:\n  ${off.join('\n  ')}`,
  ).toEqual([]);
};

for (const width of WIDE_WIDTHS) {
  test.describe(`no sideways scroll at ${width}px`, () => {
    test.use({ viewport: { width, height: REFLOW_HEIGHT } });

    for (const route of ROUTES) {
      test(`${route} does not scroll sideways at ${width}px`, async ({
        page,
      }) => {
        await expectNoHorizontalOverflow(page, route, width, false);
      });
    }
  });
}

for (const { width, contentBox, note } of REFLOW_WIDTHS) {
  test.describe(`reflow at ${width}px (${contentBox}px content box, ${note})`, () => {
    test.use({ viewport: { width, height: REFLOW_HEIGHT } });

    for (const route of ROUTES) {
      test(`${route} does not scroll sideways`, async ({ page }) => {
        await expectNoHorizontalOverflow(page, route, width, false);
        await expectContentBox(page, route, contentBox);
        await expectHeadingWordsFit(page, route);
        await expectNothingOffScreen(page, route);
      });
    }
  });

  test.describe(`reflow at ${width}px with the SC 1.4.12 text-spacing override`, () => {
    test.use({ viewport: { width, height: REFLOW_HEIGHT } });

    for (const route of ROUTES) {
      test(`${route} does not scroll sideways`, async ({ page }) => {
        await expectNoHorizontalOverflow(page, route, width, true);
        await expectCellsHoldTheirText(page, route);
      });
    }
  });
}

/* The scripted deck shows one slide at a time, so each slide is opened by its link. */
for (const route of TALK_ROUTES) {
  test.describe(`every slide of ${route} reflows at 305px`, () => {
    test.use({ viewport: { width: NARROW_WIDTH, height: REFLOW_HEIGHT } });

    for (const spacing of [false, true]) {
      test(`without sideways scroll${spacing ? ' under the SC 1.4.12 override' : ''}`, async ({
        page,
      }) => {
        await gotoSettled(page, `${route}/`);
        await page.waitForSelector('[data-deck-ready]');
        if (spacing) await page.addStyleTag({ content: TEXT_SPACING_OVERRIDE });
        const ids = await page.$$eval('.slide[id]', (all) =>
          all.map((s) => s.id),
        );
        expect(ids.length, `${route} has no slides`).toBeGreaterThan(1);

        const wide: string[] = [];
        for (const id of ids) {
          await page.evaluate((hash) => (location.hash = hash), id);
          await expect(page.locator('.slide:visible')).toHaveId(id);
          const { scrollWidth, clientWidth } = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }));
          if (scrollWidth > clientWidth) wide.push(`${id}: ${scrollWidth}px`);
        }
        expect(wide, `${route} slides that scroll sideways at 305px`).toEqual(
          [],
        );
      });
    }
  });
}
