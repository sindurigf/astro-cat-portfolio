import { expect, test } from './test';
import { builtHtml } from './routes';
import { NODE } from './tags';

/**
 * With `compressHTML`, Astro drops the line break between an inline closing tag
 * ending a source line and the next line's text ("Sam Exampleand friends").
 * Axe, the type checker and the formatter all miss it. Fix with `{' '}`.
 */

/* Every phrasing element a sentence on the site can hold, used or not, so a new one is covered. */
const INLINE =
  'a|abbr|b|cite|code|dfn|em|i|kbd|mark|q|s|samp|small|strong|sub|sup|time|u|var';

// `span` only on the opening side: the blog filter's empty marker `</span>` precedes text.
const OPENING = `${INLINE}|span`;

// src/components/Abbr.astro closes on its tooltip span, then its wrapper span.
const ABBR_END = '<span class="abbr-tip"[^>]*>[^<]*</span>\\s*</span>';

// An element whose text opens with a space, such as hidden "&nbsp;Posts", is not glued.
const GLUED = new RegExp(
  `(?:</(?:${INLINE})>|${ABBR_END})[A-Za-z]|[A-Za-z,;:.!?)]<(?:${OPENING})(?:\\s[^>]*)?>(?![\\s\u00a0]|&nbsp;)`,
  'g',
);

const CONTEXT_CHARS = 30;

test('no word is glued to an inline element', NODE, () => {
  const glued = [...builtHtml()].flatMap(([route, html]) =>
    [...html.matchAll(GLUED)].map((match) => {
      const start = Math.max(0, match.index - CONTEXT_CHARS);
      return `${route}: …${html.slice(start, match.index + CONTEXT_CHARS)}…`;
    }),
  );
  expect(glued, glued.join('\n')).toEqual([]);
});
