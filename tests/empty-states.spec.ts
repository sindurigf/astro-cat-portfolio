import { expect, test } from './test';
import { gotoSettled } from './settle';
import { builtHtml, PUBLISHED_POST_ROUTES } from './routes';
import { NODE } from './tags';

test('the 404 offers a way to report the broken link', async ({ page }) => {
  await gotoSettled(page, '/404');
  const report = page.locator('main a[href="/contact/"]', {
    hasText: /broken link/i,
  });
  await expect(report).toHaveCount(1);
});

/** Each `<tag>` element's inner HTML, nested ones included. */
const elements = (html: string, tag: string): string[] => {
  const open = new RegExp(`<${tag}\\b[^>]*>`, 'g');
  const edge = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'g');
  const found: string[] = [];
  for (const start of html.matchAll(open)) {
    const from = start.index + start[0].length;
    edge.lastIndex = from;
    let depth = 1;
    for (let match = edge.exec(html); match; match = edge.exec(html)) {
      depth += match[0].startsWith('</') ? -1 : 1;
      if (depth === 0) {
        found.push(html.slice(from, match.index));
        break;
      }
    }
  }
  return found;
};

/** Anything a reader gets beyond headings: text, or an image, control or link. */
const hasContent = (inner: string): boolean => {
  const body = inner.replace(/<h[1-6]\b[\s\S]*?<\/h[1-6]>/g, '');
  return (
    /<(?:img|picture|svg|video|canvas|a|button|input|select|textarea|iframe)\b/.test(
      body,
    ) || body.replace(/<[^>]*>/g, '').trim() !== ''
  );
};

const CONTAINERS = ['section', 'nav', 'aside', 'main', 'article'] as const;
const LISTS = ['ul', 'ol', 'dl'] as const;

test(
  'no page has an empty list, or a section or landmark with only a heading',
  NODE,
  () => {
    const problems: string[] = [];
    for (const [route, html] of builtHtml()) {
      for (const tag of LISTS) {
        for (const inner of elements(html, tag)) {
          if (!/<(?:li|dt|dd|div)\b/.test(inner)) {
            problems.push(`${route}: an empty <${tag}>`);
          }
        }
      }
      for (const tag of CONTAINERS) {
        for (const inner of elements(html, tag)) {
          if (!hasContent(inner)) {
            problems.push(`${route}: a <${tag}> with nothing but a heading`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  },
);

test(
  'with no published post, the homepage drops its post and category sections',
  NODE,
  () => {
    test.skip(
      PUBLISHED_POST_ROUTES.length > 0,
      'there is a published post, so both sections have items',
    );
    const home = builtHtml().get('/') ?? '';
    expect(home, 'the homepage was not built').toContain('<main');
    expect(
      [...home.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map(([, text]) =>
        text!.replace(/<[^>]*>/g, '').trim(),
      ),
    ).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/what i write about|featured posts/i),
      ]),
    );
    expect(home, 'the homepage links a category page').not.toMatch(
      /href="\/blog\/(?!tag\/|page\/)[a-z0-9-]+\/"/,
    );
  },
);
