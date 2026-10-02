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
/* Paragraph spacing 1.5 times the line spacing: the next paragraph's first line starts 2.5 lines below the last. */
const MIN_PARAGRAPH_STEP = 2.5;
/* Layout rounds line boxes to sub-pixels: a 1.5 line height can measure 1.4999. */
const SUBPIXEL_TOLERANCE = 0.01;
const MIN_SENTENCES = 2;
const WIDTHS = [390, 1280, 1920] as const;
const VIEWPORT_HEIGHT = 900;

interface Block {
  name: string;
  longest: number;
  lineHeight: number;
  step: number | null;
  justified: boolean;
}

for (const width of WIDTHS) {
  test.describe(`blocks of text at ${width}px (SC 1.4.8)`, () => {
    test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

    for (const route of ROUTES) {
      test(`${route} keeps lines short, leading open and paragraphs apart`, async ({
        page,
      }) => {
        await gotoSettled(page, route);
        const blocks: Block[] = await page.evaluate((minSentences) => {
          const sentences = (text: string) =>
            (text.match(/[.!?](\s|$)/g) ?? []).length;
          /* Characters per line, keyed by each line's top, from per-character boxes. */
          const lines = (el: Element) => {
            const byTop = new Map<number, number>();
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              const text = node.textContent ?? '';
              for (let i = 0; i < text.length; i += 1) {
                const range = document.createRange();
                range.setStart(node, i);
                range.setEnd(node, i + 1);
                const rect = range.getClientRects()[0];
                if (!rect) continue;
                const top = Math.round(rect.top);
                byTop.set(top, (byTop.get(top) ?? 0) + 1);
              }
            }
            return byTop;
          };
          return [
            ...document.querySelectorAll<HTMLElement>('main :is(p, li, dd)'),
          ]
            .filter(
              (el) =>
                el.checkVisibility() &&
                !el.closest('.sr-only') &&
                !el.querySelector('p, li') &&
                sentences((el.textContent ?? '').trim()) >= minSentences,
            )
            .map((el) => {
              const style = getComputedStyle(el);
              const size = parseFloat(style.fontSize);
              const own = lines(el);
              const next = el.nextElementSibling;
              let step: number | null = null;
              if (
                el.tagName === 'P' &&
                next?.tagName === 'P' &&
                next.checkVisibility()
              ) {
                const nextTops = [...lines(next).keys()];
                if (nextTops.length && own.size) {
                  step =
                    (Math.min(...nextTops) - Math.max(...own.keys())) / size;
                }
              }
              return {
                name: `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join('.')} "${(el.textContent ?? '').trim().slice(0, 40)}"`,
                longest: Math.max(0, ...own.values()),
                lineHeight: parseFloat(style.lineHeight) / size,
                step,
                justified: style.textAlign === 'justify',
              };
            });
        }, MIN_SENTENCES);

        const problems = blocks.flatMap((block) => [
          ...(block.longest > MAX_CHARACTERS
            ? [`${block.name}: a line of ${block.longest} characters`]
            : []),
          ...(block.lineHeight < MIN_LINE_HEIGHT - SUBPIXEL_TOLERANCE
            ? [`${block.name}: line height ${block.lineHeight.toFixed(2)}`]
            : []),
          ...(block.step !== null &&
          block.step < MIN_PARAGRAPH_STEP - SUBPIXEL_TOLERANCE
            ? [
                `${block.name}: next paragraph starts ${block.step.toFixed(2)} lines below`,
              ]
            : []),
          ...(block.justified ? [`${block.name}: justified`] : []),
        ]);
        expect(problems, `${route} at ${width}px fails SC 1.4.8`).toEqual([]);
      });
    }
  });
}
