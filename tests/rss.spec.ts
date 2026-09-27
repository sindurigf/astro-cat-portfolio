import { test, expect, type Page } from './test';
import { configuredSite } from './source';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  BLOG_CONTENT_DIR,
  DIST_DIR,
  frontmatterField,
  frontmatterTags,
  postFrontmatter,
  TAG_ROUTES,
  builtHtml,
} from './routes';
import { NODE } from './tags';

/*
 * The feeds from src/lib/feed.ts, parsed by the browser's XML parser so
 * malformed XML fails as it would in a strict planet aggregator.
 */

const SITE = configuredSite();
const SITE_FEED = '/rss.xml';
const RFC_822 =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} (GMT|[+-]\d{4})$/;

interface PublishedPost {
  slug: string;
  date: string;
  tags: string[];
}

/** Non-placeholder posts from the Markdown, one frontmatter field per line. */
const publishedPosts = (): PublishedPost[] =>
  readdirSync(BLOG_CONTENT_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const frontmatter = postFrontmatter(name);
      const field = (key: string): string =>
        frontmatterField(frontmatter, key) ?? '';
      return {
        slug: name.replace(/\.md$/, ''),
        placeholder: field('placeholder'),
        date: field('date'),
        tags: frontmatterTags(frontmatter),
      };
    })
    .filter((post) => post.placeholder !== 'true')
    .sort((a, b) => b.date.localeCompare(a.date));

interface ParsedFeed {
  error: string | null;
  version: string | null;
  title: string | null;
  link: string | null;
  description: string | null;
  self: string | null;
  items: { link: string; guid: string; pubDate: string; title: string }[];
}

const parseFeed = async (page: Page, path: string): Promise<ParsedFeed> => {
  const file = join(DIST_DIR, path);
  expect(existsSync(file), `${path} was not built`).toBe(true);
  const xml = readFileSync(file, 'utf8');
  await page.setContent('<!doctype html><title>feed</title>');
  return page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const error = doc.querySelector('parsererror')?.textContent ?? null;
    const channel = doc.querySelector('rss > channel');
    const child = (name: string) =>
      channel?.querySelector(`:scope > ${name}`)?.textContent ?? null;
    const self = [
      ...(channel?.getElementsByTagNameNS(
        'http://www.w3.org/2005/Atom',
        'link',
      ) ?? []),
    ].find((link) => link.getAttribute('rel') === 'self');
    return {
      error,
      version: doc.documentElement.getAttribute('version'),
      title: child('title'),
      link: child('link'),
      description: child('description'),
      self: self?.getAttribute('href') ?? null,
      items: [...(channel?.querySelectorAll(':scope > item') ?? [])].map(
        (item) => ({
          link: item.querySelector('link')?.textContent ?? '',
          guid: item.querySelector('guid')?.textContent ?? '',
          pubDate: item.querySelector('pubDate')?.textContent ?? '',
          title: item.querySelector('title')?.textContent ?? '',
        }),
      ),
    };
  }, xml);
};

const postUrl = (slug: string): string => `${SITE}/blog/${slug}/`;

const expectValidFeed = (feed: ParsedFeed, path: string): void => {
  expect(feed.error, `${path} is not well-formed XML`).toBeNull();
  expect(feed.version, `${path} is not RSS 2.0`).toBe('2.0');
  expect(feed.title, `${path} has no channel title`).toBeTruthy();
  expect(feed.description, `${path} has no channel description`).toBeTruthy();
  expect(feed.link, `${path} channel link is not absolute`).toMatch(
    /^https:\/\//,
  );
  expect(
    feed.self,
    `${path} must name itself in atom:link rel="self", absolute`,
  ).toBe(`${SITE}${path}`);
  for (const item of feed.items) {
    expect(item.title, `an item in ${path} has no title`).toBeTruthy();
    expect(item.guid, `${item.link}: guid should be the permalink`).toBe(
      item.link,
    );
    expect(item.pubDate, `${item.link}: pubDate is not RFC 822`).toMatch(
      RFC_822,
    );
  }
};

test.describe('the feeds', () => {
  test('the site feed lists every published post, newest first', async ({
    page,
  }) => {
    const posts = publishedPosts();
    expect(
      posts.length,
      'no published posts were read, so this test would check nothing',
    ).toBeGreaterThan(0);

    const feed = await parseFeed(page, 'rss.xml');
    expectValidFeed(feed, SITE_FEED);
    expect(feed.items.map((item) => item.link)).toEqual(
      posts.map((post) => postUrl(post.slug)),
    );
  });

  test('every tag feed lists exactly the posts carrying that tag', async ({
    page,
  }) => {
    const posts = publishedPosts();
    for (const route of TAG_ROUTES) {
      const tag = route.split('/').pop()!;
      const path = `${route}/rss.xml`;
      const feed = await parseFeed(page, path.slice(1));
      expectValidFeed(feed, path);
      expect(
        feed.items.map((item) => item.link),
        `${path} should list the posts tagged ${tag}, newest first`,
      ).toEqual(
        posts
          .filter((post) => post.tags.includes(tag))
          .map((post) => postUrl(post.slug)),
      );
    }
  });

  test(
    'every page advertises the site feed, and a tag page its own',
    NODE,
    () => {
      const pages = builtHtml();
      expect(pages.size, 'no built pages were read').toBeGreaterThan(0);
      const missing: string[] = [];
      for (const [route, html] of pages) {
        const feeds = [
          ...html.matchAll(
            /<link rel="alternate" type="application\/rss\+xml"[^>]*href="([^"]+)"/g,
          ),
        ].map((match) => match[1]);
        if (!feeds.includes(SITE_FEED)) missing.push(`${route}: ${SITE_FEED}`);
        if (route.startsWith('/blog/tag/')) {
          const own = `${route.replace(/\/$/, '')}/rss.xml`;
          if (!feeds.includes(own)) missing.push(`${route}: ${own}`);
        }
      }
      expect(
        missing,
        'a page is missing its feed <link rel="alternate">.',
      ).toEqual([]);
    },
  );
});
