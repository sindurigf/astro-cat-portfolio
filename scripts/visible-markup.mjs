/*
 * Drops screen-reader-only and aria-hidden elements from a markup fragment,
 * matching each to its own closing tag, so a nested tag of the same name
 * does not end it early. Void and self-closed elements have no closing tag.
 */
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*?)(\/?)>/g;
const HIDDEN_ATTRIBUTES =
  /\bclass="(?:[^"]*\s)?sr-only(?:\s[^"]*)?"|\baria-hidden="true"/;
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

export const visibleMarkup = (markup) => {
  let out = '';
  let from = 0;
  let hidden = null;
  for (const match of markup.matchAll(TAG)) {
    const [whole, closing, rawName, attributes, selfClosed] = match;
    const name = rawName.toLowerCase();
    const opens = !closing && !selfClosed && !VOID.has(name);
    if (hidden) {
      if (name !== hidden.name) continue;
      if (opens) hidden.depth += 1;
      else if (closing) hidden.depth -= 1;
      if (hidden.depth === 0) {
        hidden = null;
        from = match.index + whole.length;
        out += ' ';
      }
      continue;
    }
    if (!closing && HIDDEN_ATTRIBUTES.test(attributes)) {
      out += markup.slice(from, match.index);
      if (opens) hidden = { name, depth: 1 };
      else from = match.index + whole.length;
      if (!opens) out += ' ';
    }
  }
  return hidden ? out : out + markup.slice(from);
};
