/* Two lorem words in a passage is lorem; one could be a real mention. */
const LOREM_WORDS =
  /\b(lorem|ipsum|dolor|consectetur|adipiscing|eiusmod|tempor|incididunt|labore|veniam|nostrud|exercitation|ullamco|laboris|aliquip|commodo|consequat|irure|reprehenderit|voluptate|cillum|fugiat|pariatur|excepteur|occaecat|cupidatat|proident|officia|deserunt|mollit|perspiciatis|voluptatem|quisquam|quibusdam|temporibus|nemo)\b/gi;
const LOREM_THRESHOLD = 2;

export const looksLorem = (text: string): boolean =>
  (text.match(LOREM_WORDS) ?? []).length >= LOREM_THRESHOLD;
