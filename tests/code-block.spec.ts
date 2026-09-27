import { readFileSync } from 'node:fs';
import { expect, test } from './test';
import { gotoSettled } from './settle';
import { codeBlock } from '../src/plugins/code-block.mjs';
import { POST_ROUTES } from './routes';
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
    test(`reads as code and keeps its overflow to itself at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoSettled(page, POST_ROUTES[0]);

      const measured = await page.evaluate((html) => {
        const prose = document.querySelector('.prose');
        if (!prose) throw new Error('the post has no .prose column');
        prose.insertAdjacentHTML('beforeend', html);

        const inline = prose.querySelector('p:last-of-type code')!;
        const block = prose.querySelector('pre')!;
        const root = document.documentElement;
        return {
          inlineFamily: getComputedStyle(inline).fontFamily,
          blockFamily: getComputedStyle(block).fontFamily,
          blockOverflowX: getComputedStyle(block).overflowX,
          blockScrolls: block.scrollWidth > block.clientWidth,
          blockWithin: block.clientWidth <= prose.clientWidth,
          pageScrolls: root.scrollWidth > root.clientWidth,
        };
      }, SAMPLE);

      expect(measured.inlineFamily).toMatch(/mono/i);
      expect(measured.blockFamily).toMatch(/mono/i);
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
