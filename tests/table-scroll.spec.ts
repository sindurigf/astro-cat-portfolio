import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { tableScroll } from '../src/plugins/table-scroll.mjs';
import { hasTable } from '../src/lib/code-blocks';
import { builtHtml } from './routes';
import { REFLOW_VIEWPORT } from './wcag';
import { NODE } from './tags';

/** `src/plugins/table-scroll.mjs` and the `.prose` table rules. */

const tableNode = () => ({
  type: 'element',
  tagName: 'table',
  properties: {},
  children: [],
});

const wrapping = () => {
  const wrappers: Record<string, any>[] = [];
  return {
    wrappers,
    ctx: {
      wrapNode: (_node: unknown, parent: Record<string, any>) => {
        wrappers.push(parent);
      },
    },
  };
};

test('the visitor is registered with the markdown processor', NODE, () => {
  const config = readFileSync('astro.config.mjs', 'utf8');
  const processor = /hastPlugins:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '';

  expect(
    processor.split(',').map((name) => name.trim()),
    'tableScroll is not registered in hastPlugins',
  ).toContain('tableScroll');
});

test.describe('the table-scroll visitor', () => {
  test('wraps a post table in a named tab stop', NODE, () => {
    const { wrappers, ctx } = wrapping();
    tableScroll({
      fileURL: 'file:///site/src/content/blog/a.md',
    }).element.visit(tableNode(), ctx);

    expect(wrappers).toHaveLength(1);
    expect(wrappers[0]?.tagName).toBe('div');
    expect(wrappers[0]?.properties).toMatchObject({
      tabIndex: 0,
      role: 'group',
      ariaLabel: 'Table, scrolls sideways',
    });
  });

  test('leaves a slide table alone', NODE, () => {
    const { wrappers, ctx } = wrapping();
    tableScroll({
      fileURL: 'file:///site/src/content/talks/a/slides.md',
    }).element.visit(tableNode(), ctx);

    expect(wrappers, 'a slide sizes its own table and has no scroller').toEqual(
      [],
    );
  });
});

test('hasTable finds a GFM table and passes plain prose', NODE, () => {
  expect(hasTable('| a | b |\n| --- | --- |\n| 1 | 2 |\n')).toBe(true);
  expect(hasTable('a | b\n:-- | --:\n1 | 2\n')).toBe(true);
  expect(hasTable('> | a | b |\n> | --- | --- |\n')).toBe(true);
  expect(hasTable('<table><tr><td>1</td></tr></table>\n')).toBe(true);
  expect(hasTable('A paragraph.\n\n---\n\nAnother.\n')).toBe(false);
  expect(hasTable('- a list item\n- another\n')).toBe(false);
});

/* SC 1.4.10: outside a slide, a table only scrolls in its own box, never clipped or pushing the page. */
test('every table outside a slide sits in a table scroller', NODE, () => {
  const bare = [...builtHtml()]
    .filter(([route]) => !route.startsWith('/talks/'))
    .filter(
      ([, html]) =>
        (html.match(/<table\b/g) ?? []).length !==
        (html.match(/class="table-scroll"/g) ?? []).length,
    )
    .map(([route]) => route);

  expect(bare, 'page(s) with a table outside a .table-scroll box').toEqual([]);
});

/** The first post route whose built HTML has a table scroller. */
const tablePost = (): string => {
  const route = [...builtHtml()].find(([, html]) =>
    html.includes('class="table-scroll"'),
  )?.[0];
  expect(route, 'no built post has a table to measure').toBeDefined();
  return route!;
};

const scrollerState = (page: Page) =>
  page
    .locator('.prose .table-scroll')
    .first()
    .evaluate((box) => ({
      scrolls: box.scrollWidth - box.clientWidth > 1,
      tabIndex: (box as HTMLElement).tabIndex,
      name: box.getAttribute('aria-label') ?? '',
    }));

/* SC 1.4.10 allows a data table to scroll in two dimensions; a word split across lines is harder to read than a scroll. */
test.describe('a post table at 320px', () => {
  test('splits no word across lines and keeps its overflow to itself', async ({
    page,
  }) => {
    await page.setViewportSize(REFLOW_VIEWPORT);
    await gotoSettled(page, tablePost());

    const measured = await page.evaluate(() => {
      const split: string[] = [];
      for (const cell of document.querySelectorAll('.prose :is(th, td)')) {
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent ?? '';
          /* A break after a hyphen is a normal line break, not a split word. */
          for (const match of text.matchAll(/[^\s-]+/g)) {
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            const lines = new Set(
              [...range.getClientRects()].map((rect) => Math.round(rect.top)),
            );
            if (lines.size > 1) split.push(match[0]);
          }
        }
      }
      const root = document.documentElement;
      return { split, pageScrolls: root.scrollWidth > root.clientWidth };
    });

    expect(measured.split, 'table words broken across lines').toEqual([]);
    expect(
      measured.pageScrolls,
      'a table may scroll sideways; the page may not (SC 1.4.10)',
    ).toBe(false);
  });
});

/* SC 2.1.1, 2.4.3, 4.1.2: a scroller is a tab stop and says it scrolls only while it does. */
test.describe('a post table is a tab stop only while it scrolls', () => {
  test('at 1280px it fits and leaves the tab order', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoSettled(page, tablePost());
    await expect
      .poll(
        () => scrollerState(page),
        'a table that fits is still a tab stop, or named as scrolling',
      )
      .toMatchObject({ scrolls: false, tabIndex: -1, name: 'Table' });
  });

  test('narrowed until it overflows, it becomes a tab stop', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoSettled(page, tablePost());
    await page
      .locator('.prose .table-scroll')
      .first()
      .evaluate((box) => {
        (box as HTMLElement).style.maxWidth = '8rem';
      });
    await expect
      .poll(
        () => scrollerState(page),
        'an overflowing table is no tab stop, or not named as scrolling',
      )
      .toMatchObject({
        scrolls: true,
        tabIndex: 0,
        name: 'Table, scrolls sideways',
      });
  });
});

/* SC 1.4.10: /brand's columns clip their overflow, so a table wider than its clipping box hides cells nobody can scroll to. */
test('/brand at 390px: no table is cut off by a box that does not scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await gotoSettled(page, '/brand');

  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll('table')].flatMap((table) => {
      const { left, right } = table.getBoundingClientRect();
      for (
        let parent = table.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        const overflow = getComputedStyle(parent).overflowX;
        if (overflow === 'visible') continue;
        if (overflow === 'auto' || overflow === 'scroll') return [];
        const box = parent.getBoundingClientRect();
        return left < box.left - 0.5 || right > box.right + 0.5
          ? [table.caption?.textContent ?? 'a table']
          : [];
      }
      return [];
    }),
  );

  expect(clipped, 'tables cut off by a box that does not scroll').toEqual([]);
});
