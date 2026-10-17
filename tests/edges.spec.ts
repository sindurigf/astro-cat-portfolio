import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { NON_TEXT, PAGE_HELPERS } from './contrast';

/*
 * One edge role per ground (docs/STYLEGUIDE.md, Borders): SC 1.4.11 for
 * controls on the page and on a gold fill; a card is a block whose fill or ink
 * edge reads against the page, with no paper behind it.
 */
const ROUTE = '/';
const PLAIN_CARD =
  'main .card:not(.card-solid):not(.surface-gold):not(.surface-gold *)';
const PAGE_CONTROL = 'main a.btn-secondary';
/* Gold bricks on the header bar: edged in the bar's line color, so the edge reads on the bar. */
const GOLD_FILLS = ['header .nav-cta', 'header .theme-switch'];
/* A footer tile has no drawn edge: its fill meets the ground and its throw. */
const FOOTER_TILE = 'footer .footer-sticker';

interface Edges {
  cardEdgeAlpha: number;
  cardEdgeRatio: number | null;
  cardFillRatio: number | null;
  cardPaper: string;
  controlRatio: number | null;
  fillEdgeRatios: Record<string, number | null>;
  tileFillRatio: number | null;
  tileEdgeAlpha: number;
}

const readEdges = (page: Page): Promise<Edges> =>
  page.evaluate(`(() => {
    ${PAGE_HELPERS}
    const card = document.querySelector(${JSON.stringify(PLAIN_CARD)});
    const control = document.querySelector(${JSON.stringify(PAGE_CONTROL)});
    if (!card || !control) throw new Error('the home page has no plain card or page control');
    const cardStyle = getComputedStyle(card);
    const paper = getComputedStyle(card, '::before').backgroundImage + ' ' + getComputedStyle(card, '::after').backgroundImage;
    const edge = parse(cardStyle.borderTopColor);
    const cardGround = effectiveBackground(card.parentElement);
    const fill = parse(cardStyle.backgroundColor);
    const controlEdge = parse(getComputedStyle(control).borderTopColor);
    const controlGround = effectiveBackground(control.parentElement);
    const fillEdgeRatios = {};
    for (const selector of ${JSON.stringify(GOLD_FILLS)}) {
      const element = document.querySelector(selector);
      const style = element && getComputedStyle(element);
      const ground = element && effectiveBackground(element.parentElement);
      const rim = style && parse(style.borderTopColor);
      fillEdgeRatios[selector] = ground && rim ? ratio(rim, ground) : null;
    }
    const tile = document.querySelector(${JSON.stringify(FOOTER_TILE)});
    const tileStyle = tile && getComputedStyle(tile);
    const tileFill = tileStyle && parse(tileStyle.backgroundColor);
    const tileGround = tile && effectiveBackground(tile.parentElement);
    return {
      tileFillRatio: tileFill && tileGround ? ratio(tileFill, tileGround) : null,
      tileEdgeAlpha: tileStyle ? parse(tileStyle.borderTopColor).a : 1,
      cardEdgeAlpha: edge ? edge.a : 1,
      cardEdgeRatio: edge && cardGround ? ratio(over(edge, cardGround), cardGround) : null,
      cardFillRatio: fill && cardGround ? ratio(fill, cardGround) : null,
      cardPaper: paper,
      controlRatio: controlEdge && controlGround ? ratio(controlEdge, controlGround) : null,
      fillEdgeRatios,
    };
  })()`) as Promise<Edges>;

const expectFillEdges = (edges: Edges): void => {
  for (const [selector, value] of Object.entries(edges.fillEdgeRatios)) {
    expect(
      value,
      `${selector}'s edge should reach ${NON_TEXT}:1 against the bar it sits on`,
    ).toBeGreaterThanOrEqual(NON_TEXT);
  }
};

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`${colorScheme} mode edges`, () => {
    test.use({ colorScheme });

    test('a card is a block with an ink edge and no paper; controls keep their edges', async ({
      page,
    }) => {
      await gotoSettled(page, ROUTE);
      const edges = await readEdges(page);
      expect(
        Math.max(edges.cardFillRatio ?? 1, edges.cardEdgeRatio ?? 1),
        `a card's fill or edge should reach ${NON_TEXT}:1 against the page`,
      ).toBeGreaterThanOrEqual(NON_TEXT);
      expect(edges.cardEdgeAlpha, 'a card should draw its ink edge').toBe(1);
      expect(edges.cardPaper, 'a card should carry no paper').toBe('none none');
      expect(
        edges.controlRatio,
        `a control on the page should have an edge of at least ${NON_TEXT}:1`,
      ).toBeGreaterThanOrEqual(NON_TEXT);
      expectFillEdges(edges);
      expect(
        edges.tileFillRatio,
        `a footer tile's fill should reach ${NON_TEXT}:1 against the footer`,
      ).toBeGreaterThanOrEqual(NON_TEXT);
      expect(
        edges.tileEdgeAlpha,
        'a footer tile should draw no edge, so its throw meets its fill',
      ).toBe(0);
    });
  });
}
