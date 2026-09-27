/*
 * Makes every fenced code block a tab stop (SC 2.1.1): `.prose pre` scrolls
 * sideways, and overflow depends on the viewport. `group`, not `region`: a
 * name needs a role, and `region` would add a landmark per block.
 */

const LABEL = 'Code, scrolls sideways';

export const codeBlock = {
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
    },
  },
};
