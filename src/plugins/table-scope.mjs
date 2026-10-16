/*
 * Marks a Markdown table's header cells as column headers (H63). GFM writes
 * `th` only in the header row, so every one is a column header; a table with
 * row headers is written as HTML, which keeps its own `scope`.
 */

export const tableScope = {
  name: 'table-scope',

  element: {
    filter: ['th'],

    visit(node, ctx) {
      if (node.properties?.scope === undefined) {
        ctx.setProperty(node, 'scope', 'col');
      }
    },
  },
};
