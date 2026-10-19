import { test, expect } from './test';
import { configuredSite } from './source';
import {
  CATEGORY_ROUTES,
  POST_ROUTES,
  ROUTES,
  TAG_ROUTES,
  builtHtml,
} from './routes';
import { NODE } from './tags';
import { LD_JSON } from './html';

/*
 * The JSON-LD BreadcrumbList (src/lib/structured-data.ts) must be the visible
 * trail (Breadcrumbs.astro) plus the page's <h1>: Google asks structured data
 * to describe what the page shows.
 */

const TRAIL_ROUTES: readonly string[] = [
  ...POST_ROUTES,
  ...CATEGORY_ROUTES,
  ...TAG_ROUTES,
];

interface Crumb {
  name: string;
  item?: string;
}

const SITE = configuredSite();

const decode = (text: string): string =>
  text
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

const visibleTrail = (html: string): Crumb[] | null => {
  const nav = /<nav aria-label="Breadcrumb"[^>]*>([\s\S]*?)<\/nav>/.exec(html);
  if (!nav) return null;
  return [...nav[1]!.matchAll(/<a href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map(
    (match) => ({ name: decode(match[2]!), item: `${SITE}${match[1]}` }),
  );
};

const breadcrumbList = (html: string): Crumb[] | null => {
  const block = LD_JSON.exec(html);
  const graph = block
    ? (JSON.parse(block[1]!)['@graph'] as Record<string, unknown>[])
    : [];
  const list = graph.find((node) => node['@type'] === 'BreadcrumbList');
  if (!list) return null;
  return (list.itemListElement as Record<string, unknown>[]).map(
    (element, index) => {
      expect(element.position, 'positions count up from 1').toBe(index + 1);
      return {
        name: element.name as string,
        ...(element.item ? { item: element.item as string } : {}),
      };
    },
  );
};

/* Soft hyphens from `headingLabel` (src/lib/blog.ts) are break hints, not part of the name. */
const heading = (html: string): string =>
  decode(
    (/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, ''),
  ).replace(/\u00ad/g, '');

test.describe('breadcrumbs', NODE, () => {
  test('every post and listing has a trail that starts at Home', () => {
    const pages = builtHtml();
    for (const route of TRAIL_ROUTES) {
      const html = pages.get(route);
      expect(html, `${route} was not built`).toBeDefined();
      const trail = visibleTrail(html!);
      expect(
        trail,
        `${route} has no <nav aria-label="Breadcrumb">`,
      ).not.toBeNull();
      expect(trail!.slice(0, 2), `${route} should start Home / Blog`).toEqual([
        { name: 'Home', item: `${SITE}/` },
        { name: 'Blog', item: `${SITE}/blog/` },
      ]);
    }
  });

  test("a post's trail ends at its category", () => {
    const pages = builtHtml();
    for (const route of POST_ROUTES) {
      const html = pages.get(route)!;
      const last = visibleTrail(html)!.at(-1)!;
      expect(
        last.item,
        `${route}: the last crumb should be the post's category listing`,
      ).toMatch(new RegExp(`^${SITE}/blog/[a-z-]+/$`));
      expect(
        (CATEGORY_ROUTES as readonly string[]).includes(
          new URL(last.item!).pathname.replace(/\/$/, ''),
        ),
        `${route}: ${last.item} is not a category listing`,
      ).toBe(true);
    }
  });

  test('the JSON-LD is the visible trail plus the page itself', () => {
    const pages = builtHtml();
    for (const route of TRAIL_ROUTES) {
      const html = pages.get(route)!;
      expect(
        breadcrumbList(html),
        `${route}: the BreadcrumbList does not match the trail on the page`,
      ).toEqual([...visibleTrail(html)!, { name: heading(html) }]);
    }
  });

  test('pages outside the blog carry neither', () => {
    const pages = builtHtml();
    const others = ROUTES.filter(
      (route) => route === '/blog' || !route.startsWith('/blog'),
    );
    expect(
      others.length,
      'no routes outside the blog were found',
    ).toBeGreaterThan(0);
    for (const route of others) {
      const html = pages.get(route)!;
      expect(visibleTrail(html), `${route} has a breadcrumb trail`).toBeNull();
      expect(breadcrumbList(html), `${route} has a BreadcrumbList`).toBeNull();
    }
  });
});
