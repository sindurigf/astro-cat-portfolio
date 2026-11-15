/*
 * Wraps a post table in a named tab stop that scrolls sideways (SC 1.4.10
 * allows it for data tables), so cells never break words. `group`, not
 * `region`, as in code-block.mjs.
 */

export const TABLE_SCROLL_CLASS = 'table-scroll';

const FALLBACK_NAME = 'Table';
/* Must match SCROLLS_SUFFIX in src/scripts/scroll-fit.ts, which strips it while the table fits. */
const SCROLLS_SUFFIX = ', scrolls sideways';
const NAMES_KEY = 'tableScrollNames';

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const CAPTION = new Set(['caption']);

const isElement = (node, tagNames) =>
  node?.type === 'element' && tagNames.has(node.tagName);

const captionOf = (table, ctx) => {
  const caption = (table.children ?? []).find((child) =>
    isElement(child, CAPTION),
  );
  return caption ? ctx.textContent(caption).trim() : '';
};

/* The nearest heading before `node` in document order among its siblings, then its ancestors' siblings. */
const headingBefore = (node, ctx) => {
  for (let current = node; current; current = ctx.parent(current)) {
    const siblings = ctx.parent(current)?.children ?? [];
    const before = siblings.slice(0, ctx.indexOf(current) ?? 0).reverse();
    const heading = before.find((sibling) => isElement(sibling, HEADINGS));
    if (heading) return ctx.textContent(heading).trim();
  }
  return '';
};

const baseName = (table, ctx) => {
  const caption = captionOf(table, ctx);
  if (caption) return caption;
  const heading = headingBefore(table, ctx);
  return heading ? `${FALLBACK_NAME}: ${heading}` : FALLBACK_NAME;
};

/* No two groups in a document share a name (SC 2.4.6): a repeat takes the next free number, "Table 2". */
const uniqueName = (name, ctx) => {
  const used = (ctx.data[NAMES_KEY] ??= new Set());
  let unique = name;
  for (let count = 2; used.has(unique); count += 1) unique = `${name} ${count}`;
  used.add(unique);
  return unique;
};

export const tableScroll = () => ({
  name: 'table-scroll',

  element: {
    filter: ['table'],

    visit(node, ctx) {
      ctx.wrapNode(node, {
        type: 'element',
        tagName: 'div',
        properties: {
          className: [TABLE_SCROLL_CLASS],
          tabIndex: 0,
          role: 'group',
          ariaLabel: `${uniqueName(baseName(node, ctx), ctx)}${SCROLLS_SUFFIX}`,
        },
        children: [],
      });
    },
  },
});
