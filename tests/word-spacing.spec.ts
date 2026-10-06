import { expect, test } from './test';
import { builtHtml } from './routes';
import { NODE } from './tags';

/**
 * With `compressHTML`, Astro drops the line break between an inline closing tag
 * ending a source line and the next line's text ("Sam Exampleand friends").
 * Axe, the type checker and the formatter all miss it. Fix with `{' '}`.
 */
const INLINE = 'a|strong|em|b|i|code';

// `span` only on the opening side: the blog filter's empty marker `</span>` precedes text.
const OPENING = `${INLINE}|span`;

// An element whose text opens with a space, such as hidden "&nbsp;Posts", is not glued.
const GLUED = new RegExp(
  `</(?:${INLINE})>[A-Za-z]|[A-Za-z]<(?:${OPENING})(?:\\s[^>]*)?>(?![\\s\u00a0]|&nbsp;)`,
  'g',
);

const CONTEXT_CHARS = 30;

test('no word is glued to a link or an emphasis', NODE, () => {
  const glued = [...builtHtml()].flatMap(([route, html]) =>
    [...html.matchAll(GLUED)].map((match) => {
      const start = Math.max(0, match.index - CONTEXT_CHARS);
      return `${route}: …${html.slice(start, match.index + CONTEXT_CHARS)}…`;
    }),
  );
  expect(glued, glued.join('\n')).toEqual([]);
});
