import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';
import ts from 'typescript';
import { expect, test, type Page } from './test';
import { gotoSettled } from './settle';
import { moduleFold } from '../src/plugins/post-fold.mjs';
import { linkListItem } from '../src/plugins/link-list-item.mjs';
import { postFigure } from '../src/plugins/post-figure.mjs';
import { codeBlock } from '../src/plugins/code-block.mjs';
import { tableScope } from '../src/plugins/table-scope.mjs';
import { tableStack } from '../src/plugins/table-stack.mjs';
import { tableScroll } from '../src/plugins/table-scroll.mjs';
import { MODULE_TOGGLE_LABEL, hasFoldMarkup } from '../src/lib/post-folds';
import { BLOG_CONTENT_DIR } from '../src/lib/paths';
import { builtHtml, POST_ROUTES, PUBLISHED_POST_ROUTES } from './routes';
import { NODE } from './tags';
import { NON_TEXT, PAGE_HELPERS } from './contrast';

/** `src/plugins/post-fold.mjs`, `src/scripts/post-folds.ts` and the `.module-panel` rules. */

type Node = Record<string, any>;

const element = (tagName: string, children: Node[] = []): Node => ({
  type: 'element',
  tagName,
  properties: {},
  children,
});

const textOf = (node: Node): string =>
  node.type === 'text'
    ? node.value
    : (node.children ?? []).map(textOf).join('');

/** The visitor's `ctx`, reduced to what it uses; records the child-list swap. */
const context = (root: Node) => {
  let swapped: Node[] | undefined;
  const parentOf = (node: Node, from: Node = root): Node | undefined => {
    for (const child of from.children ?? []) {
      if (child === node) return from;
      const found = parentOf(node, child);
      if (found) return found;
    }
    return undefined;
  };
  return {
    swapped: () => swapped,
    ctx: {
      textContent: textOf,
      parent: (node: Node) => parentOf(node),
      setProperty: (_node: Node, key: string, value: Node[]) => {
        if (key === 'children') swapped = value;
      },
    },
  };
};

const POST = { fileURL: 'file:///site/src/content/blog/a.md' };

/** The hast plugin names in `astro.config.mjs`, in order. */
const configPlugins = (): string[] =>
  (
    /hastPlugins:\s*\[([^\]]*)\]/.exec(
      readFileSync('astro.config.mjs', 'utf8'),
    )?.[1] ?? ''
  )
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

test('the visitor is registered with the markdown processor', NODE, () => {
  expect(configPlugins(), 'moduleFold is not in hastPlugins').toEqual(
    expect.arrayContaining(['moduleFold']),
  );
});

test.describe('the module-fold visitor', () => {
  const h2 = (value: string) => element('h2', [{ type: 'text', value }]);
  const p = () => element('p');

  test(
    'puts each module h2 and its open fold in one panel, the h2 outside the fold',
    NODE,
    () => {
      const one = h2('Module 1: Set Up');
      const root = element('div', [
        h2('Before You Start'),
        p(),
        one,
        p(),
        p(),
        h2('Side Path: Move a Site'),
        p(),
        h2('Between Modules'),
        p(),
      ]);
      const { swapped, ctx } = context(root);

      moduleFold(POST).element.visit(one, ctx);

      const isPanel = (node: Node) =>
        node.properties?.className?.includes('module-panel');
      const shape = (swapped() ?? []).map((node) => {
        if (isPanel(node)) {
          const [heading, fold] = node.children;
          return `panel[${heading.tagName}|${textOf(fold.children[0])}:${fold.children.length - 1}]`;
        }
        return node.tagName === 'div' ? 'controls' : node.tagName;
      });
      expect(shape).toEqual([
        'h2',
        'p',
        'controls',
        'panel[h2|Steps for Module 1:2]',
        'panel[h2|Steps for Side Path:1]',
        'h2',
        'p',
      ]);
      const folds = (swapped() ?? [])
        .filter(isPanel)
        .map((panel) => panel.children[1]);
      expect(folds.every((fold) => fold.properties.open === true)).toBe(true);
    },
  );

  test('leaves slides alone', NODE, () => {
    const one = h2('Module 1: Set Up');
    const { swapped, ctx } = context(element('div', [one, p()]));

    moduleFold({
      fileURL: 'file:///site/src/content/talks/a/slides.md',
    }).element.visit(one, ctx);

    expect(swapped()).toBeUndefined();
  });
});

/* The site's own pipeline, so the fixture renders as a post would. */
const PLUGINS: Record<string, unknown> = {
  linkListItem,
  postFigure,
  codeBlock,
  tableScope,
  tableStack,
  tableScroll,
  moduleFold,
};

const FIXTURE = 'tests/fixtures/post-folds.md';

type Renderer = Awaited<ReturnType<typeof createSatteriMarkdownProcessor>>;

let pipeline: Promise<Renderer> | undefined;

/** Markdown rendered as a post by the `hastPlugins` in `astro.config.mjs`, in their order. */
const renderPost = async (markdown: string): Promise<string> => {
  pipeline ??= (async () => {
    const names = configPlugins();
    const unknown = names.filter((name) => !(name in PLUGINS));
    expect(
      unknown,
      'hastPlugins has a plugin this spec does not import',
    ).toEqual([]);
    return createSatteriMarkdownProcessor({
      hastPlugins: names.map((name) => PLUGINS[name]) as never,
      syntaxHighlight: false,
    });
  })();
  const { code } = await (
    await pipeline
  ).render(markdown, {
    fileURL: pathToFileURL(join(BLOG_CONTENT_DIR, 'post-folds.md')),
  });
  return code;
};

const renderFixture = (): Promise<string> =>
  renderPost(readFileSync(FIXTURE, 'utf8'));

/* A built page carries the fold script only when its own post has a fold. */
const FOLD_SCRIPT = ts.transpileModule(
  readFileSync('src/scripts/post-folds.ts', 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

const PROSE_OPEN = '<div class="prose">';

/** A built post, the host for the fixture: its template, CSS and scripts are the real ones. */
const FOLD_POST = PUBLISHED_POST_ROUTES[0]!;

/** Serves `FOLD_POST` with the rendered fixture first in its prose and the fold script after it; `closed` serves the modules closed. */
const serveFoldPost = async (page: Page, { closed = false } = {}) => {
  const rendered = await renderFixture();
  const body = closed
    ? rendered.replaceAll('data-module="" open>', 'data-module="">')
    : rendered;
  await page.route(
    (url) => url.pathname.replace(/\/$/, '') === FOLD_POST,
    async (route) => {
      const response = await route.fetch();
      const html = await response.text();
      expect(html, `${FOLD_POST} has no prose to host the fixture`).toContain(
        PROSE_OPEN,
      );
      await route.fulfill({
        response,
        body: html
          .replace(PROSE_OPEN, `${PROSE_OPEN}${body}`)
          .replace(
            '</body>',
            `<script type="module">${FOLD_SCRIPT}</script></body>`,
          ),
      });
    },
  );
};

/** Opens the fixture post, settled, with an optional hash. */
const gotoFoldPost = async (page: Page, hash = '') => {
  await serveFoldPost(page);
  await gotoSettled(page, `${FOLD_POST}${hash}`);
};

/* GOV.UK: "Do not put accordions within accordions"; Watch Out lists and long code stay open. */
test(
  "renders each module as one panel, with nothing folded inside it, through the site's pipeline",
  NODE,
  async () => {
    const html = await renderFixture();
    const count = (pattern: RegExp) => html.match(pattern)?.length ?? 0;

    expect(count(/<div class="module-panel">/g), 'module panels').toBe(4);
    expect(
      count(/<details class="post-fold" data-module/g),
      'module folds',
    ).toBe(4);
    expect(count(/<details/g), 'a fold other than a module fold').toBe(4);
    expect(html, 'the Watch Out list is missing').toMatch(
      /<h3 id="watch-out">Watch Out<\/h3>\s*<ul>/,
    );
  },
);

const NO_FOLD_BODY = 'Text.\n\n## A Heading\n\n### Steps\n\n- One step.\n';

test(
  'hasFoldMarkup, which decides the fold script, finds rendered folds only',
  NODE,
  async () => {
    expect(
      hasFoldMarkup(await renderFixture()),
      'hasFoldMarkup missed the fixture folds',
    ).toBe(true);
    expect(
      hasFoldMarkup(await renderPost(NO_FOLD_BODY)),
      'hasFoldMarkup found a fold in plain text',
    ).toBe(false);
  },
);

test('ends the last module before the footnotes', NODE, async () => {
  const html = await renderFixture();
  const footnotes = html.indexOf('<section data-footnotes');

  expect(footnotes, 'the fixture has no footnotes').toBeGreaterThan(-1);
  expect(
    html.lastIndexOf('</details>'),
    'the footnotes sit inside a fold',
  ).toBeLessThan(footnotes);
});

/* Astro names a component's bundled script after the component file. */
const FOLD_SCRIPT_SRC =
  /<script[^>]+src="[^"]*\/PostFolds\.astro_astro_type_script_/;

test(
  'a built post ships the fold script exactly when it has a fold',
  NODE,
  () => {
    const html = builtHtml();
    const wrong = POST_ROUTES.filter((route) => {
      const page = html.get(route);
      expect(page, `${route} was not built`).toBeDefined();
      return hasFoldMarkup(page!) !== FOLD_SCRIPT_SRC.test(page!);
    });

    expect(POST_ROUTES.length, 'no built post to check').toBeGreaterThan(0);
    expect(
      wrong,
      'posts that ship the fold script without a fold, or a fold without it',
    ).toEqual([]);
  },
);

const modules = (page: Page) => page.locator('details[data-module]');

/** The first module fold: open on load. */
const firstFold = (page: Page) => modules(page).first();

test.describe('a post fold', () => {
  /* SC 2.1.1: Enter and Space toggle it from the keyboard. */
  test('opens and closes from the keyboard', async ({ page }) => {
    await gotoFoldPost(page);
    const fold = firstFold(page);
    const summary = fold.locator('summary');

    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(fold, 'Enter did not close the fold').not.toHaveAttribute(
      'open',
    );
    await page.keyboard.press('Space');
    await expect(fold, 'Space did not open the fold').toHaveAttribute(
      'open',
      '',
    );
  });

  /* SC 4.1.2, 2.5.3: one name across toggles, starting with the visible word; the expanded state alone changes. */
  test('keeps one name that starts with its visible label', async ({
    page,
  }) => {
    await gotoFoldPost(page);
    const summary = firstFold(page).locator(':scope > summary');
    const isOpen = () =>
      summary.evaluate((el) => (el.parentElement as HTMLDetailsElement).open);

    await expect(summary).toHaveAccessibleName(
      /^Steps for (Module \d+|Side Path)$/,
    );
    expect(
      await summary.evaluate(
        (el) => el.querySelector('.fold-label')?.firstChild?.textContent,
      ),
      'the visible label is not the start of the name',
    ).toBe(MODULE_TOGGLE_LABEL);
    const name = await summary.evaluate((el) => el.textContent?.trim() ?? '');
    expect(await isOpen()).toBe(true);

    await summary.click();
    expect(await isOpen()).toBe(false);
    await expect(
      summary,
      'the name changed when the fold closed',
    ).toHaveAccessibleName(name);

    await summary.click();
    expect(await isOpen()).toBe(true);
    await expect(
      summary,
      'the name changed when the fold opened',
    ).toHaveAccessibleName(name);
  });

  /* SC 1.4.10, 1.4.4: the toggle in the bar never covers the heading's words. */
  for (const width of [320, 390, 1280]) {
    test(`keeps the toggle off the module heading text at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoFoldPost(page);

      const overlaps: string[] = await page.evaluate(() =>
        [...document.querySelectorAll('.module-panel')].flatMap((panel) => {
          const heading = panel.querySelector(':scope > h2')!;
          const toggle = panel
            .querySelector(':scope > details > summary')!
            .getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(heading);
          return [...range.getClientRects()].some(
            (line) =>
              line.right > toggle.left &&
              line.left < toggle.right &&
              line.bottom > toggle.top &&
              line.top < toggle.bottom,
          )
            ? [heading.textContent ?? '']
            : [];
        }),
      );

      expect(
        await page.locator('.module-panel').count(),
        'the fixture has no module panel',
      ).toBeGreaterThan(0);
      expect(overlaps, 'headings the toggle covers').toEqual([]);
    });
  }

  /* SC 2.5.5: the summary is at least 44px tall. */
  test('has a summary at least 44px tall', async ({ page }) => {
    await gotoFoldPost(page);
    expect(
      await page.locator('details.post-fold > summary').count(),
      'the fixture has no fold summary',
    ).toBeGreaterThan(0);
    const short = await page.evaluate(() =>
      [...document.querySelectorAll('details.post-fold > summary')]
        .map((summary) => summary.getBoundingClientRect().height)
        .filter((height) => height < 44),
    );

    expect(short, 'summaries under 44px tall').toEqual([]);
  });

  /* SC 1.4.11: the toggle's edge reaches 3:1 against the page and the heading bar beside it, or its fill does against the page. */
  for (const colorScheme of ['dark', 'light'] as const) {
    test(`draws every summary's boundary at 3:1 in ${colorScheme} mode`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ colorScheme });
      const page = await context.newPage();
      await gotoFoldPost(page);

      const ratios: number[] = await page.evaluate(`(() => {
        ${PAGE_HELPERS}
        return [...document.querySelectorAll('details.post-fold > summary')].map((summary) => {
          const style = getComputedStyle(summary);
          const ground = effectiveBackground(summary.parentElement);
          const side = ['Top', 'Right', 'Bottom', 'Left'].find((name) => parseFloat(style['border' + name + 'Width']) >= 1);
          const edge = side ? parse(style['border' + side + 'Color']) : null;
          const fill = parse(style.backgroundColor);
          const bar = effectiveBackground(summary.closest('.module-panel')?.querySelector(':scope > h2'));
          if (!ground || !bar) return 0;
          return Math.max(
            edge ? Math.min(ratio(over(edge, ground), ground), ratio(over(edge, bar), bar)) : 0,
            fill && fill.a === 1 ? Math.min(ratio(fill, ground), ratio(fill, bar)) : 0,
          );
        });
      })()`);

      expect(ratios.length, 'the fixture has no fold summary').toBeGreaterThan(
        0,
      );
      expect(
        ratios.filter((value) => value < NON_TEXT),
        'summaries whose edge and fill are both under 3:1',
      ).toEqual([]);
      await context.close();
    });
  }

  /* SC 2.4.3: a link to something inside a closed fold opens it. */
  test('opens for a link to an id inside it', async ({ page }) => {
    await gotoFoldPost(page);
    const fold = firstFold(page);
    await fold
      .locator(':scope > p')
      .first()
      .evaluate((el) => {
        el.id = 'inside-a-fold';
      });
    await fold.locator(':scope > summary').click();
    await expect(fold).not.toHaveAttribute('open');

    await page.evaluate(() => {
      location.hash = 'inside-a-fold';
    });

    await expect(fold, 'the linked fold stayed closed').toHaveAttribute(
      'open',
      '',
    );
    await expect(
      page.locator('#inside-a-fold'),
      'the opened target is out of view',
    ).toBeInViewport();
  });

  /* Function: a malformed escape in the address does not stop the script. */
  test('still wires the buttons after a malformed hash', async ({ page }) => {
    await gotoFoldPost(page, '#50%-off');

    await expect(
      page.getByRole('button', { name: 'Close All Modules' }),
    ).toBeVisible();
  });

  /* Print and paper readers: every fold prints open, then the reader's choice returns. */
  test('opens every fold for print and restores them after', async ({
    page,
  }) => {
    await gotoFoldPost(page);
    await firstFold(page).locator(':scope > summary').click();
    const closedCount = () =>
      page.locator('details.post-fold:not([open])').count();
    const closedBefore = await closedCount();
    expect(closedBefore).toBeGreaterThan(0);

    await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
    expect(await closedCount(), 'a fold stayed closed for print').toBe(0);

    await page.evaluate(() => dispatchEvent(new Event('afterprint')));
    expect(await closedCount(), 'print did not restore the folds').toBe(
      closedBefore,
    );
  });

  /* Print and paper readers: a fold left closed prints open without the script. */
  test('prints a closed fold open without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await serveFoldPost(page, { closed: true });
    await page.goto(FOLD_POST);
    await page.emulateMedia({ media: 'print' });

    const counts = await page.evaluate(() => {
      const content = [
        ...document.querySelectorAll(
          'details.post-fold:not([open]) > :not(summary)',
        ),
      ];
      return {
        closed: content.length,
        hidden: content.filter((el) => !el.checkVisibility()).length,
      };
    });

    expect(counts.closed, 'the post has no closed fold').toBeGreaterThan(0);
    expect(counts.hidden, 'fold content hidden in print').toBe(0);
    await context.close();
  });

  /* SC 1.3.1, 2.4.6: content everyone needs is never hidden on load; module headings stay headings. */
  test('opens every module on load with its h2 outside', async ({ page }) => {
    await gotoFoldPost(page);
    const count = await modules(page).count();
    expect(count, 'the post has no module fold').toBeGreaterThan(0);

    const closed = await page
      .locator('details[data-module]:not([open])')
      .count();
    expect(closed, 'a module starts closed').toBe(0);
    const outside = await page.evaluate(() =>
      [...document.querySelectorAll('details[data-module]')].every(
        (fold) => fold.previousElementSibling?.tagName === 'H2',
      ),
    );
    expect(outside, 'a module fold does not follow its h2').toBe(true);
    expect(
      await page.locator('details h2').count(),
      'an h2 sits inside a fold',
    ).toBe(0);
    expect(
      await page.locator('details details').count(),
      'a fold sits inside a fold',
    ).toBe(0);
  });

  /* SC 2.1.1: the buttons close and open every module. */
  test('closes and opens all modules with its buttons', async ({ page }) => {
    await gotoFoldPost(page);

    await page.getByRole('button', { name: 'Close All Modules' }).click();
    expect(await page.locator('details[data-module][open]').count()).toBe(0);
    await page.getByRole('button', { name: 'Open All Modules' }).click();
    expect(await page.locator('details[data-module]:not([open])').count()).toBe(
      0,
    );
  });

  /* Function: buttons that would do nothing are not shown. */
  test('hides the module buttons without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await serveFoldPost(page);
    await page.goto(FOLD_POST);

    await expect(page.locator('.module-controls')).toHaveCount(1);
    await expect(page.locator('.module-controls')).toBeHidden();
    await context.close();
  });

  /* SC 2.4.3: a link to a module heading opens the module a reader closed. */
  test('opens a closed module for a link to its heading', async ({ page }) => {
    await gotoFoldPost(page);
    const fold = modules(page).nth(2);
    const id = await fold.evaluate((el) => el.previousElementSibling?.id ?? '');
    expect(id, 'the module h2 has no id').not.toBe('');

    await fold.locator(':scope > summary').click();
    await expect(fold).not.toHaveAttribute('open');
    await page.locator(`a[href="#${id}"]`).first().click();
    await expect(
      fold,
      'the contents link left the module closed',
    ).toHaveAttribute('open', '');

    await fold.locator(':scope > summary').click();
    await page.evaluate(() => {
      location.hash = '';
    });
    await page.evaluate((target) => {
      location.hash = target;
    }, id);
    await expect(fold, 'the hash left the module closed').toHaveAttribute(
      'open',
      '',
    );
  });

  /* Print and paper readers: controls are not printed. */
  test('leaves the module buttons out of print', async ({ page }) => {
    await gotoFoldPost(page);
    await page.emulateMedia({ media: 'print' });

    await expect(page.locator('.module-controls')).toHaveCount(1);
    await expect(page.locator('.module-controls')).toBeHidden();
  });

  /* SC 1.4.4, 1.4.10: at the largest Text Size the toggle drops below the bar rather than overflow or cover the heading. */
  for (const width of [390, 1280]) {
    test(`fits the toggle at 200% Text Size at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoFoldPost(page);
      await page.evaluate(() =>
        document.documentElement.style.setProperty('--text-scale', '2'),
      );
      expect(
        await page.locator('.module-panel').count(),
        'the fixture has no module panel',
      ).toBeGreaterThan(0);

      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                [...document.querySelectorAll('.module-panel')].filter(
                  (panel) => {
                    const toggle = panel.querySelector(
                      ':scope > details > summary',
                    )!;
                    const box = toggle.getBoundingClientRect();
                    const range = document.createRange();
                    range.selectNodeContents(
                      panel.querySelector(':scope > h2')!,
                    );
                    return (
                      toggle.scrollWidth > toggle.clientWidth ||
                      [...range.getClientRects()].some(
                        (line) =>
                          line.right > box.left &&
                          line.left < box.right &&
                          line.bottom > box.top &&
                          line.top < box.bottom,
                      )
                    );
                  },
                ).length,
            ),
          { message: 'panels whose toggle overflows or covers the heading' },
        )
        .toBe(0);
    });
  }
});
