/*
 * Labels each value with its column (aria-hidden) for prose.css's stacked rows;
 * roles keep table semantics where `display: block` drops them:
 * https://adrianroselli.com/2018/02/tables-css-display-properties-and-aria.html
 */

import { TALKS_PATH } from './post-figure.mjs';

const STACK_CLASS = 'table-stack';
const LABEL_CLASS = 'table-label';

const ROWGROUPS = new Set(['thead', 'tbody', 'tfoot']);

const elements = (node) =>
  (node.children ?? []).filter((child) => child.type === 'element');

const rowsOf = (table) =>
  elements(table).flatMap((child) =>
    ROWGROUPS.has(child.tagName) ? elements(child) : [child],
  );

const cellRole = (cell, inHead) => {
  if (cell.tagName === 'td') return 'cell';
  if (inHead || cell.properties?.scope === 'col') return 'columnheader';
  return 'rowheader';
};

const spans = (cell) =>
  Number(cell.properties?.colSpan ?? 1) > 1 ||
  Number(cell.properties?.rowSpan ?? 1) > 1;

/* A two-column table has no title column: both values need their label. */
const TITLE_COLUMN_MIN = 3;

const labelFor = (text) => ({
  type: 'element',
  tagName: 'span',
  properties: { className: [LABEL_CLASS], ariaHidden: 'true' },
  children: [{ type: 'text', value: text }],
});

export const tableStack = ({ fileURL } = {}) => ({
  name: 'table-stack',

  element: {
    filter: ['table'],

    visit(table, ctx) {
      if (String(fileURL ?? '').includes(TALKS_PATH)) return;
      ctx.setProperty(table, 'role', 'table');

      /* Labels follow cell position, which spanned cells shift; such a table scrolls. */
      const stacks = !rowsOf(table).some((row) => elements(row).some(spans));
      if (stacks) {
        const authored = [table.properties?.className ?? []].flat();
        ctx.setProperty(table, 'className', [...authored, STACK_CLASS]);
      }

      const head = elements(table).find((child) => child.tagName === 'thead');
      const names = elements(elements(head ?? {})[0] ?? {}).map((cell) =>
        ctx.textContent(cell).trim(),
      );
      const firstLabeled = names.length < TITLE_COLUMN_MIN ? 0 : 1;

      for (const group of elements(table)) {
        if (ROWGROUPS.has(group.tagName)) {
          ctx.setProperty(group, 'role', 'rowgroup');
        }
      }

      for (const row of rowsOf(table)) {
        ctx.setProperty(row, 'role', 'row');
        const inHead = ctx.parent(row)?.tagName === 'thead';
        elements(row).forEach((cell, index) => {
          ctx.setProperty(cell, 'role', cellRole(cell, inHead));
          const name = names[index];
          if (stacks && !inHead && index >= firstLabeled && name) {
            ctx.prependChild(cell, labelFor(name));
          }
        });
      }
    },
  },
});
