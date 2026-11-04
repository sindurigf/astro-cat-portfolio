import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { captures } from './captures';
import { itemAt } from '../src/lib/defined';
import { gotoSettled } from './settle';
import { codeBlock } from '../src/plugins/code-block.mjs';
import { builtHtml, DIST_DIR, NO_POST, POST_ROUTES } from './routes';
import { hasCodeBlock } from '../src/lib/code-blocks';
import { REFLOW_VIEWPORT } from './wcag';
import { NODE } from './tags';
import { requireContent } from './content';
import ts from 'typescript';
import type { Page } from '@playwright/test';
import { NON_TEXT, PAGE_HELPERS } from './contrast';
import { pathToFileURL } from 'node:url';
import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';
import { linkListItem } from '../src/plugins/link-list-item.mjs';
import { postFigure } from '../src/plugins/post-figure.mjs';
import { moduleFold } from '../src/plugins/post-fold.mjs';
import { tableScope } from '../src/plugins/table-scope.mjs';
import { tableStack } from '../src/plugins/table-stack.mjs';
import { tableScroll } from '../src/plugins/table-scroll.mjs';
import { BLOG_CONTENT_DIR } from '../src/lib/paths';

/**
 * `src/plugins/code-block.mjs` and the `.prose code` / `.prose pre` rules. No
 * post has code yet, so the visitor takes a fixture and the CSS is measured on
 * markup injected into a real post's `.prose`.
 */

/** The visitor's `ctx`, reduced to what it uses; records the frame that replaces a post block. */
const visitorContext = () => {
  const replaced: Record<string, any>[] = [];
  return {
    replaced,
    setProperty: (node: Record<string, any>, key: string, value: unknown) => {
      node.properties = { ...(node.properties ?? {}), [key]: value };
    },
    replaceNode: (_node: unknown, by: Record<string, any>) => {
      replaced.push(by);
    },
  };
};

const POST = { fileURL: 'file:///site/src/content/blog/a.md' };
const TALK = { fileURL: 'file:///site/src/content/talks/a/slides.md' };

const preNode = (child: Record<string, unknown>) => ({
  type: 'element',
  tagName: 'pre',
  properties: {} as Record<string, unknown>,
  children: [child],
});

const codeChild = { type: 'element', tagName: 'code', children: [] };

/* No post has a code fence, so the config is the only evidence. */
test('the visitor is registered with the markdown processor', NODE, () => {
  const config = readFileSync('astro.config.mjs', 'utf8');
  const processor = /hastPlugins:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '';

  expect(
    processor.split(',').map((name) => name.trim()),
    'codeBlock is not registered in hastPlugins',
  ).toContain('codeBlock');
});

/*
 * Shiki writes inline `style` attributes, which the `style-src` in
 * public/_headers (no 'unsafe-inline') blocks in production.
 */
test(
  'syntax highlighting stays off while the CSP forbids inline styles',
  NODE,
  () => {
    const config = readFileSync('astro.config.mjs', 'utf8');
    const headers = readFileSync('public/_headers', 'utf8');

    expect(config).toMatch(/syntaxHighlight:\s*false/);
    expect(
      headers.includes("style-src 'self'") &&
        !/style-src[^;]*'unsafe-inline'/.test(headers),
      'style-src now allows inline styles, so a highlighter is possible',
    ).toBe(true);
  },
);

test.describe('the code-block visitor', () => {
  test('makes a fenced block a named tab stop', NODE, () => {
    const node = preNode(codeChild);
    codeBlock(POST).element.visit(node, visitorContext());

    expect(node.properties.tabIndex).toBe(0);
    expect(node.properties.role).toBe('group');
    expect(node.properties.ariaLabel).toBe('Code, scrolls sideways');
  });

  /* Function: a post block gets its frame, its language label and the copy name. */
  test('frames a post block with its fence language as the label', NODE, () => {
    const code = {
      ...codeChild,
      properties: { className: ['language-bash'] } as Record<string, unknown>,
    };
    const node = preNode(code);
    const ctx = visitorContext();
    codeBlock(POST).element.visit(node, ctx);

    const [frame] = ctx.replaced;
    expect(frame?.properties.className).toEqual(['code-block']);
    expect(frame?.children.map((child: any) => child.tagName)).toEqual([
      'span',
      'pre',
    ]);
    expect(frame?.children[0].children[0].value).toBe('bash');
    expect(
      frame?.children[0].properties.ariaHidden,
      'the visible label is read twice: it is in the name',
    ).toBe('true');
    expect(node.properties.ariaLabel).toBe('bash code, scrolls sideways');
    expect(node.properties.dataCopy).toBe('bash code');
  });

  test('frames a block without a language with no label', NODE, () => {
    const node = preNode(codeChild);
    const ctx = visitorContext();
    codeBlock(POST).element.visit(node, ctx);

    expect(
      ctx.replaced[0]?.children.map((child: any) => child.tagName),
    ).toEqual(['pre']);
    expect(node.properties.dataCopy).toBe('code');
  });

  /* Function: a slide sizes its own code and loads no copy script. */
  test('leaves a slide block unframed', NODE, () => {
    const node = preNode(codeChild);
    const ctx = visitorContext();
    codeBlock(TALK).element.visit(node, ctx);

    expect(ctx.replaced).toEqual([]);
    expect(node.properties.dataCopy).toBeUndefined();
  });

  test('drops the fence language class, which nothing styles', NODE, () => {
    const code = {
      ...codeChild,
      properties: { className: ['language-bash'] } as Record<string, unknown>,
    };
    codeBlock(POST).element.visit(preNode(code), visitorContext());

    expect(
      code.properties.className,
      'a language-* class reached the page with no CSS for it',
    ).toBeNull();
  });

  test('leaves preformatted text that is not code alone', NODE, () => {
    const node = preNode({ type: 'text', value: 'a receipt, not code' });
    codeBlock(POST).element.visit(node, visitorContext());

    expect(
      node.properties,
      'a bare <pre> is not code and must not get a code block name',
    ).toEqual({});
  });

  test('does not write a second tabindex over one already there', NODE, () => {
    const node = preNode(codeChild);
    node.properties.tabIndex = -1;
    codeBlock(POST).element.visit(node, visitorContext());

    expect(
      node.properties.tabIndex,
      'an existing tabindex must not be overwritten',
    ).toBe(-1);
  });
});

/* Injected into a real post so `.post-layout`, `.prose` and the gutter apply. */
const SAMPLE = `
  <p>Inline <code>drush cr</code> in a sentence.</p>
  <pre tabindex="0" role="group" aria-label="Code, scrolls sideways"><code>drush --uri=https://example.test sql:query "SELECT nid, title FROM node_field_data WHERE status = 1 ORDER BY created DESC LIMIT 20;"</code></pre>
`;

test.describe('code in a post, as it renders', () => {
  for (const width of [1280, REFLOW_VIEWPORT.width]) {
    test(`keeps its overflow to itself at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      requireContent(POST_ROUTES.length > 0, NO_POST);
      await gotoSettled(page, itemAt(POST_ROUTES, 0));

      const measured = await page.evaluate((html) => {
        const prose = document.querySelector('.prose');
        if (!prose) throw new Error('the post has no .prose column');
        prose.insertAdjacentHTML('beforeend', html);

        /* The sample, not a code block the post already has. */
        const blocks = prose.querySelectorAll('pre');
        const block = blocks[blocks.length - 1]!;
        const root = document.documentElement;
        return {
          blockOverflowX: getComputedStyle(block).overflowX,
          blockScrolls: block.scrollWidth > block.clientWidth,
          blockWithin: block.clientWidth <= prose.clientWidth,
          pageScrolls: root.scrollWidth > root.clientWidth,
        };
      }, SAMPLE);

      expect(measured.blockOverflowX).toBe('auto');

      expect(
        measured.blockScrolls,
        'the block should scroll the over-wide sample itself',
      ).toBe(true);
      expect(
        measured.blockWithin,
        'the block grew past its column (an `auto` grid track sizes to max-content)',
      ).toBe(true);
      expect(
        measured.pageScrolls,
        'a code block may scroll sideways; the page may not (SC 1.4.10)',
      ).toBe(false);
    });
  }
});

/* SC 1.4.10: a long path in running text wraps instead of widening the page. */
test('inline code in a paragraph wraps inside its column at 320px', async ({
  page,
}) => {
  await page.setViewportSize(REFLOW_VIEWPORT);
  requireContent(POST_ROUTES.length > 0, NO_POST);
  await gotoSettled(page, itemAt(POST_ROUTES, 0));

  const pageScrolls = await page.evaluate(() => {
    const prose = document.querySelector('.prose');
    if (!prose) throw new Error('the post has no .prose column');
    prose.insertAdjacentHTML(
      'beforeend',
      '<p>Edit <code>/srv/example/config/settings/and/a/much/longer/path.yml</code> first.</p>',
    );
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth;
  });

  expect(pageScrolls, 'inline code pushed the page sideways').toBe(false);
});

/* SC 2.4.3, 4.1.2: a stop with nothing to scroll is a dead tab, and "scrolls sideways" a false name. */
test.describe('a code block is a tab stop only while it scrolls', () => {
  const stateOf = (page: import('@playwright/test').Page) =>
    page
      .locator('.prose pre[role="group"]')
      .first()
      .evaluate((block) => ({
        scrolls: block.scrollWidth - block.clientWidth > 1,
        tabIndex: (block as HTMLElement).tabIndex,
        name: block.getAttribute('aria-label') ?? '',
      }));

  test('/brand: the short block fits and leaves the tab order', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoSettled(page, '/brand');
    await expect
      .poll(
        () => stateOf(page),
        'a block that fits is still a tab stop, or named as scrolling',
      )
      .toMatchObject({ scrolls: false, tabIndex: -1, name: 'bash code' });
  });

  /* SC 1.4.12: letter and word spacing widen the text, not the block's box. */
  test('/brand: text spacing that makes a fitting block overflow makes it a tab stop', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoSettled(page, '/brand');
    const block = page.locator('.prose pre[role="group"]').first();
    /* Just wider than its text: the narrowest it can be and still fit. */
    await block.evaluate((element) => {
      const pre = element as HTMLElement;
      const range = document.createRange();
      /* The text node: a range over an element measures its box. */
      range.selectNodeContents(pre.querySelector('code')!.firstChild!);
      const style = getComputedStyle(pre);
      const chrome =
        pre.offsetWidth -
        pre.clientWidth +
        parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight);
      pre.style.maxWidth = `${Math.ceil(range.getBoundingClientRect().width + chrome) + 2}px`;
    });
    await expect
      .poll(() => stateOf(page), 'the narrowed block should still fit')
      .toMatchObject({ scrolls: false, tabIndex: -1 });

    await page.addStyleTag({
      content:
        '* { letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }',
    });
    await expect
      .poll(
        () => stateOf(page),
        'spaced out, the block overflows but is no tab stop',
      )
      .toMatchObject({
        scrolls: true,
        tabIndex: 0,
        name: 'bash code, scrolls sideways',
      });
  });

  test('/brand: narrowed until it overflows, the block becomes a tab stop named as scrolling, and leaves again when widened', async ({
    page,
  }) => {
    await page.setViewportSize({ width: REFLOW_VIEWPORT.width, height: 900 });
    await gotoSettled(page, '/brand');
    await expect
      .poll(
        () => stateOf(page),
        'the sample does not overflow at the reflow width',
      )
      .toMatchObject({
        scrolls: true,
        tabIndex: 0,
        name: 'bash code, scrolls sideways',
      });

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect
      .poll(() => stateOf(page), 'widened, the block kept its tab stop')
      .toMatchObject({ scrolls: false, tabIndex: -1, name: 'bash code' });
  });
});

/* The selector src/scripts/prose-scroll-fit.ts queries: its fingerprint in a built chunk. */
const FIT_SELECTOR = 'pre[role=group]>code';

/** Every script a page loads, its imports followed. */
const scriptsOf = (html: string): string[] => {
  const seen = new Map<string, string>();
  const visit = (path: string): void => {
    if (seen.has(path)) return;
    const source = readFileSync(join(DIST_DIR, path), 'utf8');
    seen.set(path, source);
    for (const [, relative] of source.matchAll(
      /(?:from|import)\s*"\.\/([^"]+\.js)"/g,
    )) {
      visit(`/_astro/${relative}`);
    }
  };
  for (const src of captures(
    html,
    /<script\b[^>]*\bsrc="(\/_astro\/[^"]+)"/g,
  )) {
    visit(src);
  }
  return [...seen.values()];
};

/* Performance: the fit script loads where a code block or post table renders, and nowhere else. */
test.describe('the code-block fit script', NODE, () => {
  test('loads on every page with a code block or post table and on no other', () => {
    const wrong = [...builtHtml()]
      .filter(([, html]) => {
        const hasBlock =
          /<pre\b[^>]*\brole="group"/.test(html) ||
          html.includes('class="table-scroll"');
        const loads = scriptsOf(html).some((source) =>
          source.includes(FIT_SELECTOR),
        );
        return hasBlock !== loads;
      })
      .map(([route]) => route);

    expect(wrong, 'page(s) whose scrollers and fit script disagree').toEqual(
      [],
    );
  });

  test('hasCodeBlock finds fenced and indented code, and passes plain prose', () => {
    expect(hasCodeBlock('Text.\n\n```sh\nnpm run build\n```\n')).toBe(true);
    expect(hasCodeBlock('Text.\n\n~~~\ncode\n~~~\n')).toBe(true);
    expect(hasCodeBlock('Text.\n\n    indented code\n')).toBe(true);
    expect(hasCodeBlock('A paragraph with `inline code` only.\n')).toBe(false);
  });
});

/* Post code as src/plugins/code-block.mjs frames it, with src/scripts/copy.ts run after it. */
const FRAMED = `
  <div class="code-block"><span class="code-lang" aria-hidden="true">bash</span><pre tabindex="0" role="group" aria-label="bash code, scrolls sideways" data-copy="bash code" data-copy-word><code>make app
    indented by four spaces
	indented by a tab
drush --uri=https://example.test sql:query "SELECT nid, title FROM node_field_data WHERE status = 1;"
</code></pre></div>
`;

const COPY_SCRIPT = ts.transpileModule(
  readFileSync('src/scripts/copy.ts', 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

/** A real post with the framed sample last in its prose and the copy script run on it. */
const gotoFramed = async (page: Page, { script = true } = {}) => {
  requireContent(POST_ROUTES.length > 0, NO_POST);
  await gotoSettled(page, itemAt(POST_ROUTES, 0));
  await page.evaluate((html) => {
    document.querySelector('.prose')!.insertAdjacentHTML('beforeend', html);
  }, FRAMED);
  if (script) await page.addScriptTag({ content: COPY_SCRIPT, type: 'module' });
  return page.locator('.code-block').last();
};

test.describe('post code with its label and Copy button', () => {
  /* Function, SC 4.1.3, 2.5.3, 2.5.5: copies the code without the fence's last newline, says Copied, keeps a name that starts with its visible word, 44px. */
  test('copies the code and announces Copied', async ({ page }) => {
    await page.addInitScript(() => {
      const copied: string[] = [];
      Object.defineProperty(window, '__copied', { value: copied });
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: async (text: string) => void copied.push(text) },
      });
    });
    const frame = await gotoFramed(page);
    const button = frame.getByRole('button', { name: 'Copy bash code' });

    await expect(button).toBeVisible();
    const word = button.locator('span[aria-hidden="true"]');
    await expect(word, 'the visible word is hidden').toBeVisible();
    await expect(word).toHaveText('Copy');
    const box = (await button.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(page.getByRole('status').last()).toHaveText('Copied');
    expect(
      await page.evaluate(
        () => (window as never as { __copied: string[] }).__copied,
      ),
    ).toEqual([(await frame.locator('pre').textContent())!.replace(/\n$/, '')]);
    await expect(
      frame.getByRole('button', { name: 'Copy bash code' }),
      'the name changed after the press',
    ).toHaveCount(1);
  });

  /* SC 3.3.1: a refused copy is shown on the page, says how to copy instead, and selects the code. */
  test('shows a refused copy and selects the code', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined });
    });
    const frame = await gotoFramed(page);
    await frame.getByRole('button', { name: 'Copy bash code' }).click();

    const error = page.locator('.code-block + .copy-error').last();
    await expect(error).toBeVisible();
    expect(
      await error.evaluate(
        (el) =>
          getComputedStyle(el).color !==
          getComputedStyle(document.querySelector('.prose p')!).color,
      ),
      'the error reads in the body text color, not as an error',
    ).toBe(true);
    await expect(error).toHaveText(
      'Copy failed. The code is selected: press Ctrl+C or Command+C.',
    );
    /* A selection's text drops a trailing newline; compare without it. */
    expect(
      (await page.evaluate(() => getSelection()?.toString() ?? '')).replace(
        /\n$/,
        '',
      ),
    ).toBe((await frame.locator('pre').textContent())!.replace(/\n$/, ''));
  });

  /* SC 1.4.10: the label and the button never sit on the code's text. */
  for (const width of [REFLOW_VIEWPORT.width, 1280]) {
    test(`keeps the label and button off the code at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const frame = await gotoFramed(page);
      await expect(frame.getByRole('button')).toBeVisible();

      const covered = await frame.evaluate((block) => {
        const range = document.createRange();
        range.selectNodeContents(block.querySelector('pre code')!);
        const lines = [...range.getClientRects()];
        return [...block.querySelectorAll('.code-lang, button')].filter(
          (el) => {
            const box = el.getBoundingClientRect();
            return lines.some(
              (line) =>
                line.right > box.left &&
                line.left < box.right &&
                line.bottom > box.top &&
                line.top < box.bottom,
            );
          },
        ).length;
      });

      expect(covered, 'the label or button covers code text').toBe(0);
    });
  }

  /* SC 1.4.11, docs/STYLEGUIDE.md borders at 3:1: the grey edge against the page and the code fill. */
  for (const colorScheme of ['dark', 'light'] as const) {
    test(`draws the frame edge at 3:1 in ${colorScheme} mode`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ colorScheme });
      const page = await context.newPage();
      await gotoFramed(page);

      const ratios: number[] = await page.evaluate(`(() => {
        ${PAGE_HELPERS}
        const block = [...document.querySelectorAll('.code-block')].at(-1);
        const style = getComputedStyle(block);
        const edge = parse(style.borderTopColor);
        const fill = parse(style.backgroundColor);
        const ground = effectiveBackground(block.parentElement);
        return [ratio(over(edge, ground), ground), ratio(over(edge, fill), fill)];
      })()`);

      expect(
        ratios.filter((value) => value < NON_TEXT),
        'edge ratios under 3:1 (page, fill)',
      ).toEqual([]);
      await context.close();
    });
  }

  /* SC 3.3.1: a refusal from the browser, not a missing API, is shown the same way. */
  test('shows a copy the browser refuses', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async () => {
            throw new DOMException('Denied', 'NotAllowedError');
          },
        },
      });
    });
    const frame = await gotoFramed(page);
    await frame.getByRole('button', { name: 'Copy bash code' }).click();

    await expect(page.locator('.code-block + .copy-error').last()).toHaveText(
      'Copy failed. The code is selected: press Ctrl+C or Command+C.',
    );
  });

  /* Function: post code and a /brand Markup panel on one page each get one button. */
  test('draws one button per block when post and /brand markup meet', async ({
    page,
  }) => {
    requireContent(POST_ROUTES.length > 0, NO_POST);
    await gotoSettled(page, itemAt(POST_ROUTES, 0));
    await page.evaluate((html) => {
      document
        .querySelector('.prose')!
        .insertAdjacentHTML(
          'beforeend',
          html +
            '<div class="brand-code-frame"><pre class="brand-code" data-copy="markup for a part"><code>&lt;p&gt;</code></pre></div>',
        );
    }, FRAMED);
    await page.addScriptTag({ content: COPY_SCRIPT, type: 'module' });

    /* An inline module script runs after `addScriptTag` returns. */
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.querySelectorAll('[data-copy]')].map(
            (source) => source.parentElement!.querySelectorAll('button').length,
          ),
        ),
      )
      .toEqual([1, 1]);
  });
});

/* The site's own pipeline, so the fixture renders as a post would. */
const PLUGINS: Record<string, unknown> = {
  linkListItem,
  postFigure,
  codeBlock,
  moduleFold,
  tableScope,
  tableStack,
  tableScroll,
};

const configPlugins = (): string[] =>
  (
    /hastPlugins:\s*\[([^\]]*)\]/.exec(
      readFileSync('astro.config.mjs', 'utf8'),
    )?.[1] ?? ''
  )
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

const FENCE_BODY =
  'Text.\n\n```bash\nmake app\n    four spaces\n\tone tab\n```\n';

/* Build correctness: a fence goes through the configured plugins into the frame the browser tests assume. */
test(
  'frames a fence through the configured Markdown pipeline',
  NODE,
  async () => {
    const names = configPlugins();
    expect(
      names.filter((name) => !(name in PLUGINS)),
      'hastPlugins has a plugin this spec does not import',
    ).toEqual([]);
    const processor = await createSatteriMarkdownProcessor({
      hastPlugins: names.map((name) => PLUGINS[name]) as never,
      syntaxHighlight: false,
    });
    const { code } = await processor.render(FENCE_BODY, {
      fileURL: pathToFileURL(join(BLOG_CONTENT_DIR, 'code.md')),
    });

    expect(code).toContain(
      '<div class="code-block"><span class="code-lang" aria-hidden="true">bash</span><pre',
    );
    expect(code).toContain('aria-label="bash code, scrolls sideways"');
    expect(code).toContain('data-copy="bash code"');
    expect(code, 'whitespace inside the code changed').toContain(
      'make app\n    four spaces\n\tone tab\n</code>',
    );
  },
);

/* Build correctness: the post page loads the frame styles, and the copy script where code can be. */
test(
  'the post page wires the code frame styles and the copy script',
  NODE,
  () => {
    const postPage = readFileSync('src/pages/blog/[slug].astro', 'utf8');

    expect(postPage).toContain(
      "import '../../styles/components/code-block.css';",
    );
    expect(postPage).toMatch(/const codeInPost = hasCodeBlock\(/);
    expect(postPage).toContain('{codeInPost && <CodeCopy />}');
    expect(readFileSync('src/components/CodeCopy.astro', 'utf8')).toContain(
      "import '../scripts/copy';",
    );
  },
);

/* Build correctness: /brand ships the framed sample with no button in its HTML. */
test('/brand ships the framed sample without a static button', NODE, () => {
  const html = builtHtml().get('/brand');
  expect(html, '/brand was not built').toBeDefined();

  expect(html).toContain('class="code-block"');
  expect(html).toMatch(/<pre[^>]*data-copy="bash code"[^>]*data-copy-word/);
  expect(html, 'a Copy button is in the static HTML').not.toContain(
    'copy-word-button',
  );
});

/* Function: without a script, /brand's code sample has no Copy button. */
test('/brand draws no Copy button on its code sample without a script', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/brand');

  await expect(page.locator('.code-block pre').first()).toBeVisible();
  await expect(page.locator('.copy-word-button')).toHaveCount(0);
  await context.close();
});
