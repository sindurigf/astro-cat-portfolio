import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { NON_TEXT, PAGE_HELPERS } from './contrast';

/*
 * One edge role per ground (docs/STYLEGUIDE.md, Borders): SC 1.4.11 for
 * controls on the page and on a gold fill; a card's graph paper is decoration
 * and must leave its ground measurable and drop out in forced colors.
 */
const ROUTE = '/';
const PLAIN_CARD =
  'main .card:not(.card-solid):not(.surface-gold):not(.surface-gold *)';
const PAGE_CONTROL = 'main a.btn-secondary';
const GOLD_FILLS = ['.nav-cta', '.footer-sticker'];

interface Edges {
  cardEdgeAlpha: number;
  cardEdgeRatio: number | null;
  cardPaper: string;
  cardPaperDisplay: string;
  cardGround: string | null;
  controlRatio: number | null;
  fillEdgeRatios: Record<string, number | null>;
}

const readEdges = (page: Page): Promise<Edges> =>
  page.evaluate(`(() => {
    ${PAGE_HELPERS}
    const card = document.querySelector(${JSON.stringify(PLAIN_CARD)});
    const control = document.querySelector(${JSON.stringify(PAGE_CONTROL)});
    if (!card || !control) throw new Error('the home page has no plain card or page control');
    const cardStyle = getComputedStyle(card);
    const paper = getComputedStyle(card, '::before');
    const edge = parse(cardStyle.borderTopColor);
    const cardGround = effectiveBackground(card.parentElement);
    const ground = effectiveBackground(card);
    const controlEdge = parse(getComputedStyle(control).borderTopColor);
    const controlGround = effectiveBackground(control.parentElement);
    const fillEdgeRatios = {};
    for (const selector of ${JSON.stringify(GOLD_FILLS)}) {
      const element = document.querySelector(selector);
      const style = element && getComputedStyle(element);
      const fill = style && parse(style.backgroundColor);
      const rim = style && parse(style.borderTopColor);
      fillEdgeRatios[selector] = fill && rim ? ratio(rim, fill) : null;
    }
    return {
      cardEdgeAlpha: edge ? edge.a : 1,
      cardEdgeRatio: edge && cardGround ? ratio(over(edge, cardGround), cardGround) : null,
      cardPaper: paper.backgroundImage,
      cardPaperDisplay: paper.display,
      cardGround: ground ? cardStyle.backgroundColor : null,
      controlRatio: controlEdge && controlGround ? ratio(controlEdge, controlGround) : null,
      fillEdgeRatios,
    };
  })()`) as Promise<Edges>;

const expectFillEdges = (edges: Edges): void => {
  for (const [selector, value] of Object.entries(edges.fillEdgeRatios)) {
    expect(
      value,
      `${selector}'s edge should reach ${NON_TEXT}:1 against its own fill`,
    ).toBeGreaterThanOrEqual(NON_TEXT);
  }
};

test.describe('dark mode edges', () => {
  test.use({ colorScheme: 'dark' });

  test('a card has no edge, graph paper, and a measurable ground; controls keep their edges', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const edges = await readEdges(page);
    expect(edges.cardEdgeAlpha, 'a dark card should draw no edge').toBe(0);
    expect(edges.cardPaper, 'a dark card should carry graph paper').toContain(
      'linear-gradient',
    );
    expect(
      edges.cardGround,
      'the paper should sit on a layer, leaving the card a solid ground to measure text on',
    ).not.toBeNull();
    expect(
      edges.controlRatio,
      `a control on the page should have an edge of at least ${NON_TEXT}:1`,
    ).toBeGreaterThanOrEqual(NON_TEXT);
    expectFillEdges(edges);
  });

  test('forced colors drop the graph paper', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await gotoSettled(page, ROUTE);
    const edges = await readEdges(page);
    expect(
      edges.cardPaperDisplay,
      'the graph paper should not render in forced colors',
    ).toBe('none');
  });
});

test.describe('light mode edges', () => {
  test.use({ colorScheme: 'light' });

  test('a card keeps an edge and no graph paper; controls keep their edges', async ({
    page,
  }) => {
    await gotoSettled(page, ROUTE);
    const edges = await readEdges(page);
    expect(
      edges.cardEdgeRatio,
      `a light card's edge should reach ${NON_TEXT}:1 against the page`,
    ).toBeGreaterThanOrEqual(NON_TEXT);
    expect(edges.cardPaper, 'a light card should carry no graph paper').toBe(
      'none',
    );
    expect(
      edges.controlRatio,
      `a control on the page should have an edge of at least ${NON_TEXT}:1`,
    ).toBeGreaterThanOrEqual(NON_TEXT);
    expectFillEdges(edges);
  });
});
