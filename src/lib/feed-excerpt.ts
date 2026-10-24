/*
 * A post's opening for a planet-style aggregator: whole sentences
 * from the first prose paragraphs, up to FEED_EXCERPT_MAX_CHARACTERS
 * (ARCHITECTURE.md#feeds). Aggregators show the description as sent, uncut.
 */

export const FEED_EXCERPT_MAX_CHARACTERS = 300;

/* Headings, lists, quotes, tables, images, HTML and fences are not prose. */
const NOT_PROSE = /^(#|[-*+] |\d+\. |>|\||!\[|<|```|~~~)/;

/* A sentence ends at . ! or ?, after any closing quote or bracket. */
const SENTENCE = /[^.!?]+[.!?]+["'”’)\]]*(?=\s|$)/g;

const plainText = (markdown: string): string =>
  markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const proseParagraphs = (body: string): string[] => {
  const paragraphs: string[] = [];
  for (const block of body.split(/\n\s*\n/)) {
    const text = block.trim();
    if (text === '' || NOT_PROSE.test(text)) continue;
    /* A lead-in to a list or quote reads wrong without what it introduces. */
    if (text.endsWith(':')) break;
    paragraphs.push(plainText(text));
  }
  return paragraphs;
};

/** Whole sentences from the opening, or `undefined` when none fits. */
export const feedExcerpt = (
  body: string,
  max = FEED_EXCERPT_MAX_CHARACTERS,
): string | undefined => {
  let excerpt = '';
  for (const paragraph of proseParagraphs(body)) {
    const sentences = [...paragraph.matchAll(SENTENCE)].map((m) => m[0].trim());
    for (const sentence of sentences) {
      const next = excerpt === '' ? sentence : `${excerpt} ${sentence}`;
      if (next.length > max) return excerpt || undefined;
      excerpt = next;
    }
    /* Text after the last full stop is not a sentence; the opening ends there. */
    if (sentences.join(' ') !== paragraph) break;
  }
  return excerpt || undefined;
};
