/*
 * Makes every fenced code block a tab stop (SC 2.1.1): `.prose pre` scrolls
 * sideways, and overflow depends on the viewport; src/scripts/prose-scroll-fit.ts
 * takes one that fits out of the tab order. `group`, not `region`: a name
 * needs a role, and `region` would add a landmark per block.
 */

import { TALKS_PATH } from './post-figure.mjs';

const LABEL = 'Code, scrolls sideways';
/* After the language: "bash code, scrolls sideways". */
const LABEL_IN_POST = 'code, scrolls sideways';

export const CODE_BLOCK_CLASS = 'code-block';

const languageOf = (code) =>
  [code.properties?.className ?? []]
    .flat()
    .map(String)
    .find((name) => name.startsWith('language-'))
    ?.slice('language-'.length);

/*
 * In a post, the block sits in a frame with its fence language as a label;
 * src/scripts/copy.ts adds the Copy button from `data-copy`. Not slides: a
 * slide sizes its code itself.
 */
const frame = (node, language) => ({
  type: 'element',
  tagName: 'div',
  properties: { className: [CODE_BLOCK_CLASS] },
  children: [
    ...(language
      ? [
          {
            type: 'element',
            tagName: 'span',
            /* The group's name carries the language; this is its visible echo. */
            properties: { className: ['code-lang'], ariaHidden: 'true' },
            children: [{ type: 'text', value: language }],
          },
        ]
      : []),
    node,
  ],
});

export const codeBlock = ({ fileURL } = {}) => ({
  name: 'code-block',

  element: {
    filter: ['pre'],

    visit(node, ctx) {
      /* Fenced blocks only (`pre > code`); a bare <pre> is not code. */
      const [child] = node.children ?? [];
      if (child?.type !== 'element' || child.tagName !== 'code') return;

      /* A highlighter such as Shiki may set it already; setting it again emits it twice. */
      if (node.properties?.tabIndex === undefined) {
        ctx.setProperty(node, 'tabIndex', 0);
      }
      ctx.setProperty(node, 'role', 'group');
      ctx.setProperty(node, 'ariaLabel', LABEL);

      const language = languageOf(child);
      /* The fence's `language-*` class: no highlighter and no CSS read it. */
      if (child.properties?.className !== undefined) {
        ctx.setProperty(child, 'className', null);
      }

      if (String(fileURL ?? '').includes(TALKS_PATH)) return;
      if (language)
        ctx.setProperty(node, 'ariaLabel', `${language} ${LABEL_IN_POST}`);
      ctx.setProperty(node, 'dataCopy', language ? `${language} code` : 'code');
      ctx.setProperty(node, 'dataCopyWord', '');
      ctx.replaceNode(node, frame(node, language));
    },
  },
});
