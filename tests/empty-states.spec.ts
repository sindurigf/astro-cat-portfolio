import { expect, test } from './test';
import { captures } from './captures';
import { gotoSettled } from './settle';
import { builtHtml, PUBLISHED_POST_ROUTES } from './routes';
import { ENGINE_INVARIANT, NODE } from './tags';

test(
  'the 404 offers a way to report the broken link',
  ENGINE_INVARIANT,
  async ({ page }) => {
    await gotoSettled(page, '/404');
    const report = page.locator('main a[href="/contact/"]', {
      hasText: /broken link/i,
    });
    await expect(report).toHaveCount(1);
  },
);

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

const POST_SECTION = /what i write about|featured posts/i;
const CATEGORY_LINK = /href="\/blog\/(?!tag\/|page\/)[a-z0-9-]+\/"/;

test(
  'the homepage shows its post and category sections only while a post is published',
  NODE,
  () => {
    const published = PUBLISHED_POST_ROUTES.length > 0;
    const home = builtHtml().get('/') ?? '';
    expect(home, 'the homepage was not built').toContain('<main');
    const headings = captures(home, /<h2\b[^>]*>([\s\S]*?)<\/h2>/g).map(
      (text) => text.replace(/<[^>]*>/g, '').trim(),
    );
    expect(
      headings.some((heading) => POST_SECTION.test(heading)),
      published
        ? 'a post is published, but the homepage has no post section'
        : 'no post is published, but the homepage keeps a post section',
    ).toBe(published);
    expect(
      CATEGORY_LINK.test(home),
      published
        ? 'a post is published, but the homepage links no category page'
        : 'no post is published, but the homepage links a category page',
    ).toBe(published);
  },
);
