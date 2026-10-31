import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { builtHtml } from './routes';
import { NON_TEXT, PAGE_HELPERS } from './contrast';
import { DESKTOP_VIEWPORT, PHONE_VIEWPORT, REFLOW_VIEWPORT } from './wcag';
import { NODE } from './tags';
import { tableStack } from '../src/plugins/table-stack.mjs';

/** `src/plugins/table-stack.mjs` and the `.table-scroll` and stacked `.table-stack` rules in prose.css. */

const STACKED_VIEWPORTS = [REFLOW_VIEWPORT, PHONE_VIEWPORT];

/** Built pages with a table of `className`; read inside a test, after the build. */
const routesWith = (className: string): string[] => {
  const routes = [...builtHtml()]
    .filter(([, html]) => html.includes(`class="${className}"`))
    .map(([route]) => route);
  expect(routes, `no built page has a .${className} table`).not.toEqual([]);
  return routes;
};

/* Folds open, so a table in a closed one is measured on its own ground. */
const visit = async (page: Page, route: string): Promise<void> => {
  await gotoSettled(page, route);
  await page.evaluate(() => {
    for (const fold of document.querySelectorAll('main details')) {
      (fold as HTMLDetailsElement).open = true;
    }
  });
};

test('the visitor is registered with the markdown processor', NODE, () => {
  const processor =
    /hastPlugins:\s*\[([^\]]*)\]/.exec(
      readFileSync('astro.config.mjs', 'utf8'),
    )?.[1] ?? '';
  expect(
    processor.split(',').map((name) => name.trim()),
    'tableStack is not registered in hastPlugins',
  ).toContain('tableStack');
});

/* SC 1.3.1: every post table states its roles, so a browser that drops table semantics under `display: block` keeps them. */
test('every post table states its table roles', NODE, () => {
  const bare = [...builtHtml()]
    .filter(([route]) => route.startsWith('/blog/'))
    .filter(
      ([, html]) =>
        (html.match(/<table\b/g) ?? []).length !==
        (html.match(/<table\b[^>]*\brole="table"/g) ?? []).length,
    )
    .map(([route]) => route);

  expect(bare, 'post(s) with a table that states no role').toEqual([]);
});

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const el = (
  tagName: string,
  children: HastNode[] = [],
  properties: Record<string, unknown> = {},
): HastNode => ({ type: 'element', tagName, properties, children });

const cell = (tagName: string, text: string, properties = {}) =>
  el(tagName, [{ type: 'text', value: text }], properties);

/** The visitor's `ctx`, reduced to the methods it uses. */
const visitorContext = (root: HastNode) => {
  const parents = new Map<HastNode, HastNode>();
  const index = (node: HastNode) => {
    for (const child of node.children ?? []) {
      parents.set(child, node);
      index(child);
    }
  };
  index(root);
  const textContent = (node: HastNode): string =>
    node.value ?? (node.children ?? []).map(textContent).join('');
  return {
    setProperty: (node: HastNode, key: string, value: unknown) => {
      node.properties = { ...node.properties, [key]: value };
    },
    textContent,
    parent: (node: HastNode) => parents.get(node),
    prependChild: (node: HastNode, child: HastNode) => {
      node.children = [child, ...(node.children ?? [])];
    },
  };
};

const tableOf = (body: HastNode[], properties = {}) =>
  el(
    'table',
    [
      el('thead', [
        el('tr', [cell('th', 'Area'), cell('th', 'Plan'), cell('th', 'Cost')]),
      ]),
      el('tbody', body),
    ],
    properties,
  );

const visitTable = (table: HastNode) =>
  tableStack({ fileURL: 'file:///src/content/blog/post.md' }).element.visit(
    table,
    visitorContext(table) as never,
  );

const labelCount = (node: HastNode): number =>
  Number(node.properties?.ariaHidden === 'true') +
  (node.children ?? []).reduce((sum, child) => sum + labelCount(child), 0);

/* Build correctness: an author's class on an HTML table survives the visitor. */
test("the visitor keeps a table's own classes", NODE, () => {
  const table = tableOf(
    [el('tr', [cell('td', 'Hosting'), cell('td', 'Basic'), cell('td', 'Low')])],
    { className: ['wide'] },
  );
  visitTable(table);
  expect(table.properties?.className, 'the table lost its own class').toEqual([
    'wide',
    'table-stack',
  ]);
});

/* SC 1.3.1: labels follow cell position, so a spanned cell would put a value under the wrong column name. */
test(
  'a table with a spanned cell keeps scrolling, with no column labels',
  NODE,
  () => {
    const table = tableOf([
      el('tr', [cell('td', 'Hosting', { colSpan: 2 }), cell('td', 'Low')]),
      el('tr', [cell('td', 'Email'), cell('td', 'Basic'), cell('td', 'None')]),
    ]);
    visitTable(table);
    expect(
      [table.properties?.className ?? []].flat(),
      'a table with a spanned cell stacks',
    ).not.toContain('table-stack');
    expect(
      labelCount(table),
      'a table with a spanned cell has column labels',
    ).toBe(0);
    expect(table.properties?.role, 'the table lost its role').toBe('table');
  },
);

/** A two-column table labels both values; a wider one titles each row with its first cell. */
const TITLE_COLUMN_MIN = 3;

/** Each body cell that takes a label: its column header and its label, if any. */
const labelsOf = (page: Page) =>
  page.evaluate(
    (titleColumnMin) =>
      [...document.querySelectorAll('table.table-stack')].flatMap((table) => {
        const headers = [...table.querySelectorAll('thead th')].map(
          (cell) => cell.textContent?.trim() ?? '',
        );
        const first = headers.length < titleColumnMin ? 0 : 1;
        return [...table.querySelectorAll('tbody tr')].flatMap((row) =>
          [...row.children].slice(first).map((cell, index) => {
            const label = cell.querySelector(':scope > .table-label');
            return {
              header: headers[index + first] ?? '',
              label: label?.textContent?.trim() ?? null,
              hidden: label?.getAttribute('aria-hidden') ?? null,
            };
          }),
        );
      }),
    TITLE_COLUMN_MIN,
  );

/** Each table cell's text as a screen reader gets it: the label left out. */
const spokenText = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.table-stack :is(th, td)')].map((cell) => {
      const copy = cell.cloneNode(true) as Element;
      for (const label of copy.querySelectorAll('[aria-hidden="true"]')) {
        label.remove();
      }
      return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
    }),
  );

/** Chromium's own accessibility tree: the table roles and each cell's name. */
const chromiumTable = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const shown = nodes.filter((node) => !node.ignored);
  const roleOf = (node: (typeof nodes)[number]) => String(node.role?.value);
  const count = (role: string) =>
    shown.filter((node) => roleOf(node) === role).length;
  return {
    tables: count('table'),
    rows: count('row'),
    columnheaders: count('columnheader'),
    rowheaders: count('rowheader'),
    cells: count('cell'),
    names: shown
      .filter((node) =>
        ['columnheader', 'rowheader', 'cell'].includes(roleOf(node)),
      )
      .map((node) =>
        String(node.name?.value ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
      ),
  };
};

const domTable = (page: Page) =>
  page.evaluate(() => {
    const count = (selector: string) =>
      document.querySelectorAll(selector).length;
    return {
      tables: count('table'),
      rows: count('table tr'),
      columnheaders: count('table thead th'),
      rowheaders: count('table tbody th'),
      cells: count('table td'),
    };
  });

test.describe('a stacked table at 390px', () => {
  test.use({ viewport: PHONE_VIEWPORT });

  /* SC 1.3.1, 4.1.2: a row still reads as a row of named cells under its column headers. */
  test('keeps its table, row, header and cell roles', async ({
    page,
    browserName,
  }) => {
    for (const route of routesWith('table-stack')) {
      await visit(page, route);
      const dom = await domTable(page);
      expect(dom.cells, `${route} has no table cell`).toBeGreaterThan(0);

      await expect(page.getByRole('table')).toHaveCount(dom.tables);
      await expect(page.getByRole('row')).toHaveCount(dom.rows);
      await expect(page.getByRole('columnheader')).toHaveCount(
        dom.columnheaders,
      );
      await expect(page.getByRole('cell')).toHaveCount(dom.cells);

      if (browserName !== 'chromium') continue;
      const { names, ...roles } = await chromiumTable(page);
      expect(
        names.length,
        `${route}: Chromium lists no header or cell`,
      ).toBeGreaterThan(0);
      expect(roles, `${route}: Chromium dropped table roles`).toEqual(dom);
    }
  });

  /* SC 1.3.1, 4.1.2: the label is a visual repeat of the header cell; a screen reader hears the header once. */
  test('labels each value with its column header, hidden from assistive technology', async ({
    page,
    browserName,
  }) => {
    for (const route of routesWith('table-stack')) {
      await visit(page, route);
      const labels = await labelsOf(page);
      expect(labels, `${route} has no value cell`).not.toEqual([]);
      for (const { header, label, hidden } of labels) {
        expect(label, `${route}: a value is not labeled ${header}`).toBe(
          header,
        );
        expect(hidden, `${route}: the ${header} label is read aloud`).toBe(
          'true',
        );
      }

      if (browserName !== 'chromium') continue;
      /* The full tree is not in document order, so the names are compared as a set. */
      expect(
        (await chromiumTable(page)).names.toSorted(),
        `${route}: Chromium names a cell other than by its own text`,
      ).toEqual((await spokenText(page)).toSorted());
    }
  });
});

for (const viewport of STACKED_VIEWPORTS) {
  test.describe(`a stacked table at ${viewport.width}px`, () => {
    test.use({ viewport });

    /* SC 1.4.10: a stacked table fits the column, so neither it nor the page scrolls sideways. */
    test('scrolls neither the page nor its own box sideways', async ({
      page,
    }) => {
      for (const route of routesWith('table-stack')) {
        await visit(page, route);
        const measured = await page.evaluate(() => {
          const root = document.documentElement;
          return {
            page: root.scrollWidth > root.clientWidth,
            boxes: [
              ...document.querySelectorAll('.table-scroll:has(.table-stack)'),
            ]
              .filter((box) => box.scrollWidth - box.clientWidth > 1)
              .map((box) => box.querySelector('caption, th')?.textContent),
          };
        });
        expect(measured.page, `${route} scrolls sideways`).toBe(false);
        expect(measured.boxes, `${route}: tables that scroll sideways`).toEqual(
          [],
        );
      }
    });

    /* SC 1.4.8 best practice: a word split across lines is hard to read; a long identifier in code may break. */
    test('splits no word across lines', async ({ page }) => {
      for (const route of routesWith('table-stack')) {
        await visit(page, route);
        const split = await page.evaluate(() => {
          const out: string[] = [];
          for (const cell of document.querySelectorAll(
            '.table-stack :is(th, td)',
          )) {
            const walker = document.createTreeWalker(
              cell,
              NodeFilter.SHOW_TEXT,
            );
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              if (node.parentElement?.closest('code')) continue;
              const text = node.textContent ?? '';
              /* A break after a hyphen is a normal line break, not a split word. */
              for (const match of text.matchAll(/[^\s-]+/g)) {
                const range = document.createRange();
                range.setStart(node, match.index);
                range.setEnd(node, match.index + match[0].length);
                const lines = new Set(
                  [...range.getClientRects()].map((rect) =>
                    Math.round(rect.top),
                  ),
                );
                if (lines.size > 1) out.push(match[0]);
              }
            }
          }
          return out;
        });
        expect(split, `${route}: table words broken across lines`).toEqual([]);
      }
    });
  });
}

/** Every drawn table line, as its contrast against the ground behind the table and where it is. */
const tableEdges = (page: Page) =>
  page.evaluate(`(() => {
    ${PAGE_HELPERS}
    const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
    const out = [];
    for (const element of document.querySelectorAll('.table-scroll :is(table, tr, th, td)')) {
      const style = getComputedStyle(element);
      if (style.display === 'none') continue;
      const ground = effectiveBackground(element.closest('.table-scroll'));
      for (const side of SIDES) {
        if (['none', 'hidden'].includes(style['border' + side + 'Style'])) continue;
        if (parseFloat(style['border' + side + 'Width']) <= 0) continue;
        const edge = parse(style['border' + side + 'Color']);
        out.push({
          ratio: ground && edge ? ratio(over(edge, ground), ground) : 0,
          where: element.tagName.toLowerCase() + ' ' + side.toLowerCase() + ' ' +
            style['border' + side + 'Color'] + ' on ' + JSON.stringify(ground),
        });
      }
    }
    return out;
  })()`) as Promise<{ ratio: number; where: string }[]>;

for (const colorScheme of ['dark', 'light'] as const) {
  for (const viewport of [PHONE_VIEWPORT, DESKTOP_VIEWPORT]) {
    test.describe(`table lines in ${colorScheme} mode at ${viewport.width}px`, () => {
      test.use({ colorScheme, viewport });

      /* SC 1.4.11: the lines are what separate rows and fields, so each must read against the page. */
      test(`reach ${NON_TEXT}:1 against the page`, async ({ page }) => {
        for (const route of routesWith('table-scroll')) {
          await visit(page, route);
          const edges = await tableEdges(page);
          expect(edges, `${route} draws no table line`).not.toEqual([]);
          expect(
            [
              ...new Set(
                edges
                  .filter(({ ratio }) => ratio < NON_TEXT)
                  .map(({ where }) => where),
              ),
            ],
            `${route}: table lines under ${NON_TEXT}:1 against the page`,
          ).toEqual([]);
        }
      });
    });
  }
}
