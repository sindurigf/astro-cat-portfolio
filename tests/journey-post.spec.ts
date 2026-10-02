import { expect, test } from './test';
import {
  builtHtml,
  frontmatterField,
  postFrontmatter,
  PUBLISHED_POST_ROUTES,
} from './routes';
import { NODE } from './tags';
import { SITE_CONFIG, validateSiteConfig } from '../src/site.config';
import { JOURNEY_POST } from '../src/lib/site';

/** `journeyPost` in src/site.config.ts: the close row of these pages links it, or nothing in its place. */

const JOURNEY_ROUTES = ['/about', '/career', '/contact/sent'] as const;

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

const decode = (text: string): string =>
  text.replace(/&(?:amp|quot|#39|lt|gt);/g, (entity) => ENTITIES[entity]!);

/** The close row's eyebrow, and its links in order, from a page's built HTML. */
const closeRow = (html: string, route: string) => {
  const start = html.indexOf('data-close-row');
  expect(start, `${route} has no close row`).toBeGreaterThan(-1);
  const row = html.slice(start, html.indexOf('</div>', start));
  return {
    eyebrow: decode(/^[^>]*>([^<]*)</.exec(row)![1]!.trim()),
    links: [...row.matchAll(/<a href="([^"]+)"[^>]*>([^<]*)</g)].map(
      ([, href, text]) => ({ href, text: decode(text!.trim()) }),
    ),
  };
};

test.describe('the journey post, set', NODE, () => {
  test.skip(JOURNEY_POST === null, 'journeyPost is null in src/site.config.ts');

  test('journeyPost names a published post', () => {
    expect(PUBLISHED_POST_ROUTES).toContain(`/blog/${JOURNEY_POST}`);
  });

  test('each page ends on the journey post by its title, then its next page', () => {
    const title = frontmatterField(postFrontmatter(JOURNEY_POST!), 'title');
    const pages = builtHtml();
    for (const route of JOURNEY_ROUTES) {
      const { eyebrow, links } = closeRow(pages.get(route) ?? '', route);
      expect(eyebrow, `${route} close row eyebrow`).toBe('Continue reading');
      expect(links, `${route} close row links`).toHaveLength(2);
      expect(links[0], `${route} does not link the journey post`).toEqual({
        href: `/blog/${JOURNEY_POST}/`,
        text: title,
      });
    }
  });
});

test.describe('the journey post, unset', NODE, () => {
  test.skip(JOURNEY_POST !== null, 'journeyPost is set in src/site.config.ts');

  test('each page ends on its next page alone, with no post link or reading prompt', () => {
    const pages = builtHtml();
    for (const route of JOURNEY_ROUTES) {
      const html = pages.get(route) ?? '';
      const { eyebrow, links } = closeRow(html, route);
      expect(eyebrow, `${route} close row eyebrow`).toBe('Next');
      expect(links, `${route} close row links`).toHaveLength(1);
      expect(
        links[0]!.href,
        `${route} close row links a post with no journey post set`,
      ).not.toMatch(/^\/blog\//);
      expect(html, `${route} still prompts to continue reading`).not.toContain(
        'Continue reading',
      );
    }
  });
});

test('journeyPost must be null or a slug', NODE, () => {
  expect(() =>
    validateSiteConfig({ ...SITE_CONFIG, journeyPost: 'Not A Slug' }),
  ).toThrow(/journeyPost must be null or a post's slug/);
  expect(() =>
    validateSiteConfig({ ...SITE_CONFIG, journeyPost: null }),
  ).not.toThrow();
});
