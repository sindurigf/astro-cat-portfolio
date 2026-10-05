import type { Page } from './test';

/** Functional pages: their copy is written by whoever builds the UI (AGENTS.md "Copy"). */
export const FUNCTIONAL_ROUTES = [
  '/accessibility',
  '/brand',
  '/credits',
  '/privacy',
  '/contact',
  '/contact/sent',
  '/404',
] as const;

const ENTITIES: Record<string, string> = {
  amp: '&',
  nbsp: ' ',
  quot: '"',
  lt: '<',
  gt: '>',
};

/** `<main>` text of built HTML in source case, before CSS upper-casing. */
export const mainText = (html: string): string =>
  (/<main\b[\s\S]*?<\/main>/.exec(html)?.[0] ?? '')
    .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entity, body: string) =>
      body.startsWith('#x')
        ? String.fromCodePoint(parseInt(body.slice(2), 16))
        : body.startsWith('#')
          ? String.fromCodePoint(Number(body.slice(1)))
          : (ENTITIES[body] ?? entity),
    );

type FirstUse = {
  /** The sentence holding the first visible use in `<main>`. */
  sentence: string;
  /** The use sits in a `<dfn>` whose text is exactly the term (H54). */
  defining: boolean;
  /** Text of what the nearest `aria-describedby` ancestor points to, or null. */
  description: string | null;
};

/** The first visible use of `term` in `<main>`, or null when there is none. */
export const firstUse = (page: Page, term: string): Promise<FirstUse | null> =>
  page.evaluate((word) => {
    const escaped = word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const use = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`);
    const main = document.querySelector('main');
    if (!main) throw new Error('the page has no <main>.');

    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !use.test(node.textContent ?? '')) continue;
      if (!parent.checkVisibility({ visibilityProperty: true })) continue;

      let block: Element = parent;
      while (
        block !== main &&
        block.parentElement &&
        getComputedStyle(block).display === 'inline'
      ) {
        block = block.parentElement;
      }

      const text = (block.textContent ?? '').replace(/\s+/g, ' ').trim();
      const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z(])/);
      const dfn = parent.closest('dfn');
      const described = parent.closest('[aria-describedby]');
      const ids =
        described?.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
      const description = described
        ? ids
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ')
            .trim()
        : null;
      return {
        sentence: sentences.find((sentence) => use.test(sentence)) ?? text,
        defining: dfn?.textContent?.trim() === word,
        description,
      };
    }
    return null;
  }, term);
