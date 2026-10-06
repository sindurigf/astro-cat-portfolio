/* Chicago title case lowercases these inside a label, never first or last. */
export const TITLE_CASE_SMALL_WORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'and',
  'at',
  'but',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'nor',
  'or',
  'the',
  'to',
  'vs',
  'with',
]);

const capitalize = (word: string): string =>
  word.charAt(0).toUpperCase() + word.slice(1);

/* The unstyled <title> and link names; visible uses are uppercase CSS. */
export const categoryLabel = (category: string): string => {
  const words = category.split('-');
  const last = words.length - 1;
  return words
    .map((word, index) =>
      index > 0 && index < last && TITLE_CASE_SMALL_WORDS.has(word)
        ? word
        : capitalize(word),
    )
    .join(' ');
};

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * The first word of `text` that breaks Chicago title case, or undefined. A
 * hyphenated compound counts each part as a word; `exempt` tokens keep their
 * own case.
 */
export const titleCaseMiss = (
  text: string,
  exempt: ReadonlySet<string> = new Set(),
): string | undefined => {
  const words = text
    .split(' ')
    .map((token) => token.replace(EDGE_PUNCTUATION, ''))
    .flatMap((token) => (exempt.has(token) ? [token] : token.split('-')))
    .map((word) => word.replace(EDGE_PUNCTUATION, ''))
    .filter((word) => /\p{L}/u.test(word));
  const last = words.length - 1;
  return words.find(
    (word, index) =>
      /^\p{Ll}/u.test(word) &&
      !exempt.has(word) &&
      (index === 0 ||
        index === last ||
        !TITLE_CASE_SMALL_WORDS.has(word.toLowerCase())),
  );
};
