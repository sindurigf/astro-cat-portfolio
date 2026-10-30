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

/**
 * `src/plugins/code-block.mjs` and the `.prose code` / `.prose pre` rules. No
 * post has code yet, so the visitor takes a fixture and the CSS is measured on
 * markup injected into a real post's `.prose`.
 */

/** The visitor's `ctx`, reduced to the one method it uses. */
const visitorContext = () => ({
  setProperty: (node: Record<string, any>, key: string, value: unknown) => {
    node.properties = { ...(node.properties ?? {}), [key]: value };
  },
});

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
    codeBlock.element.visit(node, visitorContext());

    expect(node.properties.tabIndex).toBe(0);
    expect(node.properties.role).toBe('group');
    expect(node.properties.ariaLabel).toBe('Code, scrolls sideways');
  });

  test('drops the fence language class, which nothing styles', NODE, () => {
    const code = {
      ...codeChild,
      properties: { className: ['language-sh'] } as Record<string, unknown>,
    };
    codeBlock.element.visit(preNode(code), visitorContext());

    expect(
      code.properties.className,
      'a language-* class reached the page with no CSS for it',
    ).toBeNull();
  });

  test('leaves preformatted text that is not code alone', NODE, () => {
    const node = preNode({ type: 'text', value: 'a receipt, not code' });
    codeBlock.element.visit(node, visitorContext());

    expect(
      node.properties,
      'a bare <pre> is not code and must not get a code block name',
    ).toEqual({});
  });

  test('does not write a second tabindex over one already there', NODE, () => {
    const node = preNode(codeChild);
    node.properties.tabIndex = -1;
    codeBlock.element.visit(node, visitorContext());

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
      test.skip(POST_ROUTES.length === 0, NO_POST);
      await page.setViewportSize({ width, height: 900 });
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
      .toMatchObject({ scrolls: false, tabIndex: -1, name: 'Code' });
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
        name: 'Code, scrolls sideways',
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
        name: 'Code, scrolls sideways',
      });

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect
      .poll(() => stateOf(page), 'widened, the block kept its tab stop')
      .toMatchObject({ scrolls: false, tabIndex: -1, name: 'Code' });
  });
});

/* The selector src/scripts/code-block-fit.ts queries: its fingerprint in a built chunk. */
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

/* Performance: the fit script loads where a code block renders, and nowhere else. */
test.describe('the code-block fit script', NODE, () => {
  test('loads on every page with a code block and on no other', () => {
    const wrong = [...builtHtml()]
      .filter(([, html]) => {
        const hasBlock = /<pre\b[^>]*\brole="group"/.test(html);
        const loads = scriptsOf(html).some((source) =>
          source.includes(FIT_SELECTOR),
        );
        return hasBlock !== loads;
      })
      .map(([route]) => route);

    expect(wrong, 'page(s) whose code blocks and fit script disagree').toEqual(
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
