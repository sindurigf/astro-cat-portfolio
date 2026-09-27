import type AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from './test';
import {
  AA_LARGE,
  AA_TEXT,
  LARGE_TEXT_BOLD_PX,
  LARGE_TEXT_PX,
  PAGE_HELPERS,
} from './contrast';

/*
 * The colour-contrast nodes axe leaves in `incomplete`, decided by walking the
 * paint stack. axe passes a page whose text sits under decoration unmeasured.
 */

/** The one rule this file knows how to decide. Anything else is a new question. */
const DECIDABLE = 'color-contrast';

type Decided = {
  selector: string;
  text: string;
  ratio: number | null;
  floor: number;
  large: boolean;
  foreground: string;
  background: string | null;
  blockedBy: string | null;
};

/** In-page source: the thresholds and a colour formatter for the decider. */
const IN_PAGE_CONSTANTS = `
    const LARGE_PX = ${LARGE_TEXT_PX};
    const LARGE_BOLD_PX = ${LARGE_TEXT_BOLD_PX};
    const AA_TEXT = ${AA_TEXT};
    const AA_LARGE = ${AA_LARGE};

    const rgb = (c) => (c === null ? null : 'rgb(' + Math.round(c.r) + ', ' + Math.round(c.g) + ', ' + Math.round(c.b) + ')');
`;

/** In-page source: decide one node axe could not score. */
const DECIDE_NODE = `(selector) => {
      const element = document.querySelector(selector);
      const base = { selector, text: '', ratio: null, floor: AA_TEXT, large: false, foreground: '', background: null, blockedBy: null };
      if (!element) return { ...base, blockedBy: 'element not found' };

      element.scrollIntoView({ block: 'center', behavior: 'instant' });
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();

      const size = parseFloat(style.fontSize);
      const weight = Number(style.fontWeight) || 400;
      const large = size >= LARGE_PX || (size >= LARGE_BOLD_PX && weight >= 700);
      const floor = large ? AA_LARGE : AA_TEXT;
      const text = (element.textContent ?? '').trim().slice(0, 60);
      const head = { ...base, text, large, floor, foreground: style.color };

      /*
       * Everything painted in front of this text, topmost first: the question axe
       * declines to answer. A layer that paints anything is reported, not guessed.
       */
      const x = Math.min(Math.max(box.left + box.width / 2, 1), window.innerWidth - 1);
      const y = Math.min(Math.max(box.top + box.height / 2, 1), window.innerHeight - 1);
      const stack = document.elementsFromPoint(x, y);
      const index = stack.findIndex((node) => node === element || node.contains(element));
      /*
       * Never -1 in the light DOM: html is in every stack, so text that
       * pointer-events hides still has its overlays in inFront.
       */
      const inFront = index === -1 ? [] : stack.slice(0, index);

      const painting = inFront.find((node) => {
        const s = getComputedStyle(node);
        if (s.backgroundImage !== 'none') return true;
        const c = parse(s.backgroundColor);
        return c !== null && c.a > 0;
      });
      if (painting) return { ...head, blockedBy: describe(painting) };

      const foreground = parse(style.color);
      const background = effectiveBackground(element);
      if (!foreground) return { ...head, blockedBy: 'foreground colour did not parse' };
      if (!background) {
        return { ...head, blockedBy: 'no opaque ancestor background (image, gradient or alpha)' };
      }

      return {
        ...head,
        background: rgb(background),
        ratio: ratio(over(foreground, background), background),
      };
    }`;

/**
 * Resolve, in the page, what a reader actually sees behind each node axe could
 * not score. One evaluate for the whole list rather than one per node.
 */
const decide = (page: Page, selectors: string[]): Promise<Decided[]> =>
  page.evaluate(`(() => {
    ${PAGE_HELPERS}
${IN_PAGE_CONSTANTS}
    return ${JSON.stringify(selectors)}.map(${DECIDE_NODE});
  })()`) as Promise<Decided[]>;

const report = (route: string, failures: Decided[]): string =>
  [
    `${failures.length} node(s) axe left undecided did not clear their floor on ${route}:`,
    ...failures.map((f) =>
      [
        `  selector:   ${f.selector}`,
        `  text:       ${JSON.stringify(f.text)}`,
        `  foreground: ${f.foreground}`,
        `  background: ${f.background ?? '(unresolved)'}`,
        `  measured:   ${f.ratio === null ? 'could not be decided' : `${f.ratio.toFixed(2)}:1`}`,
        `  floor:      ${f.floor}:1 (SC 1.4.3, ${f.large ? 'large text' : 'body text'})`,
        f.blockedBy ? `  blocked by: ${f.blockedBy}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  ].join('\n\n');

type Results = Awaited<ReturnType<AxeBuilder['analyze']>>;

/** Soft-asserts that every node axe left undecided on this scan clears its floor. */
export const expectIncompleteDecided = async (
  page: Page,
  route: string,
  results: Results,
): Promise<void> => {
  const unknown = [
    ...new Set(
      results.incomplete
        .map((entry) => entry.id)
        .filter((id) => id !== DECIDABLE),
    ),
  ];
  expect
    .soft(
      unknown,
      `axe left ${unknown.join(', ')} undecided on ${route}, and only ` +
        `${DECIDABLE} can be decided here. Work out what the rule could not ` +
        `determine; do not widen DECIDABLE to silence this.`,
    )
    .toEqual([]);

  const selectors = results.incomplete
    .filter((entry) => entry.id === DECIDABLE)
    .flatMap((entry) => entry.nodes.map((node) => String(node.target[0])));
  if (selectors.length === 0) return;

  const failures = (await decide(page, selectors)).filter(
    (entry) => entry.ratio === null || entry.ratio < entry.floor,
  );
  expect.soft(failures, report(route, failures)).toEqual([]);
};
