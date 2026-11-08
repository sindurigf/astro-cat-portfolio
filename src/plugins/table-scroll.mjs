/*
 * Wraps a post table in a named tab stop that scrolls sideways (SC 1.4.10
 * allows it for data tables), so cells never break words. `group`, not
 * `region`, as in code-block.mjs.
 */

export const TABLE_SCROLL_CLASS = 'table-scroll';
const LABEL = 'Table, scrolls sideways';

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
          ariaLabel: LABEL,
        },
        children: [],
      });
    },
  },
});
