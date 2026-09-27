import { test, expect, type Page } from './test';
import { gotoSettled, sweepTimeout } from './settle';
import { AA_TEXT, NON_TEXT, PAGE_HELPERS } from './contrast';
import { goldRoutesFromBuild } from './routes';

/*
 * Links on the gold ground under the pointer. Colour cannot say "link" here, so
 * the underline does (SC 1.4.1), and forced colours drops the hover block, so
 * the underline has to survive hover on its own.
 */

/** Excluded by the marker rule: a control its own fill delimits takes no block. */
const FILLED_CONTROLS = ['btn-gold-primary', 'btn-gold-secondary', 'chip'];

const GOLD_LINKS = '.surface-gold a';

/** Floors that fail a sweep whose selector stopped matching; the build has more of each. */
const MORE_LINKS_THAN = 8;
const MORE_HOVERED_THAN = 5;

/**
 * What a reader sees of one link, run in the page. The baseline comes from the
 * font's ascent through a canvas, since no DOM rectangle gives it back.
 */
const READ_LINK = `(element) => {
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();

  const range = document.createRange();
  range.selectNodeContents(element);
  const lines = [...range.getClientRects()];
  const lastLine = lines[lines.length - 1] ?? box;

  const context = document.createElement('canvas').getContext('2d');
  context.font = style.fontStyle + ' ' + style.fontWeight + ' ' +
    style.fontSize + ' / ' + style.lineHeight + ' ' + style.fontFamily;
  const metrics = context.measureText('Hxg');
  const ascent = metrics.fontBoundingBoxAscent;
  const descent = metrics.fontBoundingBoxDescent;
  const baseline =
    lastLine.top + (lastLine.height - (ascent + descent)) / 2 + ascent;

  const underlined = style.textDecorationLine.includes('underline');
  const offset = style.textUnderlineOffset === 'auto'
    ? 0
    : parseFloat(style.textUnderlineOffset);
  const thickness = style.textDecorationThickness === 'auto'
    ? 1
    : parseFloat(style.textDecorationThickness);

  /* The spread of the block: the fourth length of the single shadow layer. */
  const lengths = (style.boxShadow.match(/-?[\\d.]+px/g) || []).map(parseFloat);
  const spread = lengths.length >= 4 ? lengths[3] : 0;

  const own = parse(style.backgroundColor);
  const filled = own !== null && own.a === 1;
  const ground = effectiveBackground(element.parentElement);
  const behind = filled ? own : ground;
  const colour = parse(style.color);
  const insideBlock = filled && box.bottom + spread >= baseline + offset + thickness;
  const underLine = insideBlock ? own : ground;
  const lineColour = parse(style.textDecorationColor);

  return {
    label: (element.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40),
    selector: describe(element),
    classes: [...element.classList],
    paint: [style.color, style.backgroundColor, style.boxShadow].join(' | '),
    onBehind: behind === null || colour === null
      ? null
      : ratio(over(colour, behind), behind),
    underlined,
    underlineContrast: !underlined || underLine === null || lineColour === null
      ? null
      : ratio(over(lineColour, underLine), underLine),
  };
}`;

type LinkState = {
  label: string;
  selector: string;
  classes: string[];
  paint: string;
  onBehind: number | null;
  underlined: boolean;
  underlineContrast: number | null;
};

/*
 * By index rather than through the locator: a function passed to `evaluate`
 * cannot close over PAGE_HELPERS, which is a string of source.
 */
const readLink = (page: Page, index: number): Promise<LinkState> =>
  page.evaluate(`((index) => {
    ${PAGE_HELPERS}
    const element = document.querySelectorAll(${JSON.stringify(GOLD_LINKS)})[index];
    return element === undefined ? null : (${READ_LINK})(element);
  })(${index})`) as Promise<LinkState>;

const isFilledControl = (state: LinkState): boolean =>
  state.classes.some((name) => FILLED_CONTROLS.includes(name));

test('a hovered gold link changes, reads, and keeps a visible underline', async ({
  page,
}) => {
  const routes = goldRoutesFromBuild();
  test.setTimeout(sweepTimeout(routes.length));
  let seen = 0;
  let marked = 0;

  for (const route of routes) {
    await gotoSettled(page, route);
    const links = page.locator(GOLD_LINKS);
    const count = await links.count();

    for (let index = 0; index < count; index += 1) {
      seen += 1;
      const rest = await readLink(page, index);
      if (isFilledControl(rest)) continue;

      const link = links.nth(index);
      await link.scrollIntoViewIfNeeded();
      await link.hover();

      const state = await readLink(page, index);
      const where = `${route} ${state.selector} "${state.label}"`;
      marked += 1;

      expect
        .soft(state.paint, `${where} does not change under the pointer`)
        .not.toBe(rest.paint);
      expect.soft(state.onBehind, `${where} is unmeasurable`).not.toBeNull();
      expect
        .soft(state.onBehind!, `${where} is unreadable on its own fill`)
        .toBeGreaterThanOrEqual(AA_TEXT);
      expect
        .soft(state.underlined, `${where} loses its underline on hover`)
        .toBe(true);
      expect
        .soft(state.underlineContrast, `${where}: underline unmeasurable`)
        .not.toBeNull();
      expect
        .soft(
          state.underlineContrast!,
          `${where}: the underline against what lies under it`,
        )
        .toBeGreaterThanOrEqual(NON_TEXT);
    }
  }

  expect(seen, 'too few gold-ground links were found').toBeGreaterThan(
    MORE_LINKS_THAN,
  );
  expect(marked, 'too few gold links were hovered').toBeGreaterThan(
    MORE_HOVERED_THAN,
  );
});
