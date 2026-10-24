/*
 * A post's opening for a planet-style aggregator: whole sentences
 * from the first prose paragraphs, up to FEED_EXCERPT_MAX_CHARACTERS
 * (ARCHITECTURE.md#feeds). Aggregators show the description as sent, uncut.
 */

export const FEED_EXCERPT_MAX_CHARACTERS = 300;

/* Headings, lists, quotes, tables, images, HTML and fences are not prose. */
const NOT_PROSE = /^(#|[-*+] |\d+\. |>|\||!\[|<|```|~~~)/;

/* A sentence ends at . ! or ?, after any closing quote or bracket. */
const SENTENCE = /\S.*?[.!?]+["'”’)\]]*(?=\s|$)/g;

/* Named entities a post may write; `&shy;` only marks a break, so it goes. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  shy: '',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

const SOFT_HYPHEN = 0xad;

const decodeEntity = (entity: string, name: string): string => {
  const digits = /^#(x[0-9a-f]+|\d+)$/i.exec(name)?.[1];
  if (digits !== undefined) {
    const code =
      digits.startsWith('x') || digits.startsWith('X')
        ? parseInt(digits.slice(1), 16)
        : parseInt(digits, 10);
    return code === SOFT_HYPHEN ? '' : String.fromCodePoint(code);
  }
  const named = NAMED_ENTITIES[name];
  if (named === undefined) {
    throw new Error(
      `A post's opening uses ${entity}, which the feed excerpt cannot decode; add it to NAMED_ENTITIES in src/lib/feed-excerpt.ts.`,
    );
  }
  return named;
};

const plainText = (markdown: string): string =>
  markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`]/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, decodeEntity)
    .replace(/\s+/g, ' ')
    .trim();

/* A title or initials before a full stop do not end a sentence ("Dr. Klaus", "the U.S. team"). */
const ABBREVIATION = /(?:^|\s)(?:Dr|Mr|Mrs|Ms|St|vs|(?:[A-Z]\.)*[A-Z])\.$/;

const sentencesOf = (paragraph: string): string[] => {
  const sentences: string[] = [];
  for (const [match] of paragraph.matchAll(SENTENCE)) {
    const sentence = match.trim();
    const last = sentences.at(-1);
    if (last !== undefined && ABBREVIATION.test(last)) {
      sentences[sentences.length - 1] = `${last} ${sentence}`;
    } else sentences.push(sentence);
  }
  return sentences;
};

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
    const sentences = sentencesOf(paragraph);
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
