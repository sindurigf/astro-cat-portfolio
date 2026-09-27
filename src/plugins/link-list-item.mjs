/*
 * Marks an <li> holding only one link, sized in CSS for SC 2.5.8. Not
 * `li > a:only-child`: it ignores text nodes. A Sätteri visitor: Astro 7 ignores
 * `markdown.rehypePlugins` without @astrojs/markdown-remark.
 */

const MARKER_CLASS = 'link-item';

/* The wrappers markdown can produce: `**[a](b)**`, `*[a](b)*`, `~~[a](b)~~`. */
const WRAPPERS = new Set(['strong', 'em', 'del']);

const isElement = (node, tagName) =>
  node?.type === 'element' && node.tagName === tagName;

export const linkListItem = {
  name: 'link-list-item',

  element: {
    filter: ['a'],

    visit(node, ctx) {
      let current = node;
      let parent = ctx.parent(current);

      while (parent?.type === 'element' && WRAPPERS.has(parent.tagName)) {
        current = parent;
        parent = ctx.parent(current);
      }

      if (!isElement(parent, 'li')) return;

      /* Text comparison, not child count: wrappers add no text, and "Rust, <a>" fails. */
      const whole = ctx.textContent(parent).trim();
      if (whole === '' || whole !== ctx.textContent(node).trim()) return;

      const existing = parent.properties?.className;
      ctx.setProperty(
        parent,
        'className',
        Array.isArray(existing) ? [...existing, MARKER_CLASS] : [MARKER_CLASS],
      );
    },
  },
};
