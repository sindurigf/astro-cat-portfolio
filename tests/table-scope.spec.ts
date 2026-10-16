import { readFileSync } from 'node:fs';
import { expect, test } from './test';
import { builtHtml } from './routes';
import { NODE } from './tags';
import { tableScope } from '../src/plugins/table-scope.mjs';

/* H63, SC 1.3.1: every header cell on the site says which way it heads. */

const setProperty = (
  node: Record<string, any>,
  key: string,
  value: unknown,
): void => {
  node.properties = { ...(node.properties ?? {}), [key]: value };
};

test.describe('table header scope', NODE, () => {
  test('the visitor is registered with the markdown processor', () => {
    const processor =
      /hastPlugins:\s*\[([^\]]*)\]/.exec(
        readFileSync('astro.config.mjs', 'utf8'),
      )?.[1] ?? '';
    expect(processor.split(',').map((name) => name.trim())).toContain(
      'tableScope',
    );
  });

  test('a Markdown header cell becomes a column header; a scope already set stays', () => {
    const bare: Record<string, any> = {
      type: 'element',
      tagName: 'th',
      properties: {},
    };
    tableScope.element.visit(bare, { setProperty });
    expect(bare.properties.scope).toBe('col');

    const row: Record<string, any> = {
      type: 'element',
      tagName: 'th',
      properties: { scope: 'row' },
    };
    tableScope.element.visit(row, { setProperty });
    expect(row.properties.scope).toBe('row');
  });

  test('every header cell on every built page has a scope', () => {
    const bare: string[] = [];
    let headers = 0;
    for (const [route, html] of builtHtml()) {
      for (const cell of html.match(/<th\b[^>]*>/g) ?? []) {
        headers += 1;
        if (!/\bscope="(col|row|colgroup|rowgroup)"/.test(cell))
          bare.push(route);
      }
    }
    expect(
      headers,
      'no built page has a table header to check',
    ).toBeGreaterThan(0);
    expect([...new Set(bare)], 'header cells without a scope').toEqual([]);
  });
});
