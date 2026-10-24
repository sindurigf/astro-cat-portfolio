import { defined } from '../../lib/defined';

/*
 * The light half's copy of live markup: inert and hidden, so ids, labels and
 * references go, and headings become divs that keep the heading look.
 */
export const inertCopy = (html: string): string =>
  html
    .replace(
      /\s(?:id|for|name|form|popovertarget|aria-(?:labelledby|describedby|controls))="[^"]*"/g,
      '',
    )
    .replace(/<h[1-6]\b/g, '<div data-heading')
    .replace(/<\/h[1-6]>/g, '</div>');

const INDENT = '  ';
const VOID_TAG = /^(?:br|hr|img|input|link|meta)$/;
const ASTRO_SCOPE = /\sdata-astro-cid-\w+(?:="")?/g;
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

/* An example's markup as indented source text for the code under it. */
export const sourceOf = (html: string): string => {
  let depth = 0;
  return html
    .replace(ASTRO_SCOPE, '')
    .replace(/>\s+</g, '><')
    .replace(/></g, '>\n<')
    .split('\n')
    .map((raw) => {
      const line = raw.trim();
      if (line.startsWith('</')) depth = Math.max(0, depth - 1);
      const out = INDENT.repeat(depth) + line;
      const tag = /^<([a-z][a-z0-9-]*)\b/i.exec(line)?.[1];
      const closesItself =
        line.endsWith('/>') ||
        (tag !== undefined && line.endsWith(`</${tag}>`));
      if (tag && !VOID_TAG.test(tag) && !closesItself) depth += 1;
      return out;
    })
    .join('\n')
    .replace(/[&<>]/g, (c) => defined(ESCAPES[c], `an escape for ${c}`));
};
