import { expect, test } from './test';
import { gotoSettled } from './settle';
import { ROUTES } from './routes';

/*
 * SC 1.4.8 on blocks of text, "more than one sentence" in the Understanding
 * key terms; single spacing is 1em, the basis of C21 (line-height 150%).
 * https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html
 */
const MAX_CHARACTERS = 80;
const MIN_LINE_HEIGHT = 1.5;
/* Paragraph spacing 1.5 times the line spacing: the next paragraph's first line box starts 2.5em below the last's top. */
const MIN_PARAGRAPH_STEP = 2.5;
/* Layout rounds line boxes to sub-pixels: a 1.5 line height can measure 1.4999. */
const SUBPIXEL_TOLERANCE = 0.01;
const MIN_SENTENCES = 2;
/* Glyphs whose vertical centres are further apart than this share of a line height sit on different lines. */
const NEW_LINE_SHARE = 0.5;
const WIDTHS = [390, 1280, 1920] as const;
const VIEWPORT_HEIGHT = 900;

interface Block {
  name: string;
  longest: number;
  lineHeight: number;
  justified: boolean;
}

interface Pair {
  name: string;
  step: number;
}

interface Measured {
  blocks: Block[];
  pairs: Pair[];
  candidates: number;
}

/* NaN (an unresolved `normal`) fails too. */
const below = (value: number, floor: number) =>
  !(value >= floor - SUBPIXEL_TOLERANCE);

for (const width of WIDTHS) {
  test.describe(`blocks of text at ${width}px (SC 1.4.8)`, () => {
    test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

    for (const route of ROUTES) {
      test(`${route} keeps lines short, leading open and paragraphs apart`, async ({
        page,
      }) => {
        await gotoSettled(page, route);
        const measured: Measured = await page.evaluate(
          ({ minSentences, newLineShare }) => {
            const sentences = (text: string) =>
              (text.match(/[.!?](\s|$)/g) ?? []).length;
            const visible = (el: Element) =>
              el.checkVisibility() && !el.closest('.sr-only');
            const label = (el: Element) =>
              `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join('.')} "${(el.textContent ?? '').trim().slice(0, 40)}"`;
            const lineHeightPx = (el: Element) => {
              const style = getComputedStyle(el);
              return style.lineHeight === 'normal'
                ? NaN
                : parseFloat(style.lineHeight);
            };
            /* Characters per line, grouping glyphs by vertical centre so inline code with its own box stays on its line. */
            const charactersPerLine = (el: HTMLElement) => {
              const centres: number[] = [];
              const walker = document.createTreeWalker(
                el,
                NodeFilter.SHOW_TEXT,
              );
              for (
                let node = walker.nextNode();
                node;
                node = walker.nextNode()
              ) {
                const parent = node.parentElement;
                if (!parent || !visible(parent)) continue;
                const text = node.textContent ?? '';
                for (let i = 0; i < text.length; i += 1) {
                  const range = document.createRange();
                  range.setStart(node, i);
                  range.setEnd(node, i + 1);
                  const rect = range.getClientRects()[0];
                  if (rect) centres.push((rect.top + rect.bottom) / 2);
                }
              }
              const gap =
                (lineHeightPx(el) ||
                  parseFloat(getComputedStyle(el).fontSize)) * newLineShare;
              const counts: number[] = [];
              let previous = -Infinity;
              for (const centre of centres.sort((a, b) => a - b)) {
                if (centre - previous > gap) counts.push(0);
                counts[counts.length - 1] += 1;
                previous = centre;
              }
              return counts;
            };
            const contentBox = (el: Element) => {
              const style = getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              return {
                top:
                  rect.top +
                  parseFloat(style.borderTopWidth) +
                  parseFloat(style.paddingTop),
                bottom:
                  rect.bottom -
                  parseFloat(style.borderBottomWidth) -
                  parseFloat(style.paddingBottom),
              };
            };

            const textBlocks = [
              ...document.querySelectorAll<HTMLElement>('body :is(p, li, dd)'),
            ].filter((el) => visible(el) && !el.querySelector('p, li'));

            const blocks = textBlocks
              .filter(
                (el) =>
                  sentences((el.textContent ?? '').trim()) >= minSentences,
              )
              .map((el) => {
                const style = getComputedStyle(el);
                return {
                  name: label(el),
                  longest: Math.max(0, ...charactersPerLine(el)),
                  lineHeight: lineHeightPx(el) / parseFloat(style.fontSize),
                  justified: style.textAlign === 'justify',
                };
              });

            /* Last line box top: the content bottom less one line height. */
            const pairs = textBlocks
              .filter((el) => el.tagName === 'P')
              .flatMap((el) => {
                const next = el.nextElementSibling;
                if (next?.tagName !== 'P' || !visible(next)) return [];
                const lastLineTop = contentBox(el).bottom - lineHeightPx(el);
                const larger = Math.max(
                  parseFloat(getComputedStyle(el).fontSize),
                  parseFloat(getComputedStyle(next).fontSize),
                );
                return [
                  {
                    name: label(el),
                    step: (contentBox(next).top - lastLineTop) / larger,
                  },
                ];
              });

            return {
              blocks,
              pairs,
              candidates: textBlocks.filter((el) => el.closest('main')).length,
            };
          },
          { minSentences: MIN_SENTENCES, newLineShare: NEW_LINE_SHARE },
        );

        expect(
          measured.candidates,
          `${route} at ${width}px has no visible paragraph, list item or description in main to measure.`,
        ).toBeGreaterThan(0);

        const problems = [
          ...measured.blocks.flatMap((block) => [
            ...(block.longest > MAX_CHARACTERS
              ? [`${block.name}: a line of ${block.longest} characters`]
              : []),
            ...(below(block.lineHeight, MIN_LINE_HEIGHT)
              ? [
                  `${block.name}: line height ${Number.isNaN(block.lineHeight) ? 'normal' : block.lineHeight.toFixed(2)}`,
                ]
              : []),
            ...(block.justified ? [`${block.name}: justified`] : []),
          ]),
          ...measured.pairs.flatMap((pair) =>
            below(pair.step, MIN_PARAGRAPH_STEP)
              ? [
                  `${pair.name}: next paragraph's first line starts ${pair.step.toFixed(2)}em below this one's last`,
                ]
              : [],
          ),
        ];
        expect(problems, `${route} at ${width}px fails SC 1.4.8`).toEqual([]);
      });
    }
  });
}
