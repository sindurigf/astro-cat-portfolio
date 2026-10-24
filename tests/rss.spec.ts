import { test, expect, type Page } from './test';
import { configuredSite } from './source';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DIST_DIR,
  POSTS,
  TAG_ROUTES,
  builtHtml,
  NO_PUBLISHED_POST,
  PUBLISHED_POST_ROUTES,
} from './routes';
import { NODE } from './tags';
import {
  FEED_EXCERPT_MAX_CHARACTERS,
  feedExcerpt,
} from '../src/lib/feed-excerpt';
import { SITE_CONFIG } from '../src/site.config';

/*
 * The feeds from src/lib/feed.ts, parsed by the browser's XML parser so
 * malformed XML fails as it would in a strict planet aggregator.
 */

const SITE = configuredSite();
const SITE_FEED = '/rss.xml';
const RFC_822 =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} (GMT|[+-]\d{4})$/;

/** Published posts, newest first, as `sortByNewest` orders them (tests/routes.ts). */
const publishedPosts = () =>
  POSTS.filter((post) => post.published).map((post) => ({
    slug: post.route.replace(/^\/blog\//, ''),
    tags: post.tags,
  }));

interface ParsedFeed {
  error: string | null;
  version: string | null;
  title: string | null;
  link: string | null;
  description: string | null;
  self: string | null;
  items: {
    link: string;
    guid: string;
    pubDate: string;
    title: string;
    description: string;
  }[];
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
          description: item.querySelector('description')?.textContent ?? '',
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
    test.skip(PUBLISHED_POST_ROUTES.length === 0, NO_PUBLISHED_POST);
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

test.describe('the opening feed', () => {
  test('the opening feed tag carries whole sentences from each opening within the cap, and every other tag feed the teaser', async ({
    page,
  }) => {
    const site = await parseFeed(page, SITE_FEED);
    const teaserOf = (link: string) =>
      site.items.find((item) => item.link === link)?.description;
    for (const route of TAG_ROUTES) {
      const tag = route.split('/').pop();
      const path = `${route}/rss.xml`;
      const feed = await parseFeed(page, path);
      for (const item of feed.items) {
        if (tag !== SITE_CONFIG.openingFeedTag) {
          expect(
            item.description,
            `${path}: ${item.link} should carry its teaser`,
          ).toBe(teaserOf(item.link));
          continue;
        }
        expect(
          item.description.length,
          `${path}: ${item.link} is over ${FEED_EXCERPT_MAX_CHARACTERS} characters`,
        ).toBeLessThanOrEqual(FEED_EXCERPT_MAX_CHARACTERS);
        expect(
          item.description,
          `${path}: ${item.link} does not end a sentence`,
        ).toMatch(/[.!?]["'”’)\]]*$/);
      }
    }
  });

  test.describe('feedExcerpt', NODE, () => {
    test('stops before a paragraph that leads into a list', () => {
      const body =
        'Ruins outlast almost everything we build. You have walked past several of these this week:\n\n- a wall\n- a well\n\nThe uncomfortable part is that few people read them.';
      expect(feedExcerpt(body)).toBeUndefined();
      expect(feedExcerpt(`A first sentence.\n\n${body}`)).toBe(
        'A first sentence.',
      );
    });

    test('keeps whole sentences under the cap, across paragraphs', () => {
      const body = 'One two three. Four five six.\n\nSeven eight nine. Ten.';
      expect(feedExcerpt(body, 30)).toBe('One two three. Four five six.');
      expect(feedExcerpt(body, 100)).toBe(
        'One two three. Four five six. Seven eight nine. Ten.',
      );
    });

    test('skips headings and images, and keeps link text', () => {
      const body =
        '## Start\n\n![A photo](../assets/a.jpg)\n\nI read [the stone](https://example.com/) in **1522**.';
      expect(feedExcerpt(body)).toBe('I read the stone in 1522.');
    });

    test('ends at text after the last full stop of a paragraph', () => {
      expect(feedExcerpt('Done here. And then\n\nMore later.')).toBe(
        'Done here.',
      );
    });

    test('decodes entities, dropping soft hyphens, so the feed never shows them', () => {
      expect(
        feedExcerpt(
          'Pone&shy;glyphs&nbsp;matter &amp; it&#8217;s &#x201C;hard&#x201D;.',
        ),
      ).toBe('Poneglyphs matter & it’s “hard”.');
      expect(() => feedExcerpt('A &bogus; entity.')).toThrow(/&bogus;/);
    });

    test('keeps titles and initials inside their sentence', () => {
      expect(
        feedExcerpt('I met Dr. Clover in the W.B. archive. It went well.', 40),
      ).toBe('I met Dr. Clover in the W.B. archive.');
      expect(feedExcerpt('Version 5.5 shipped. Then more.', 25)).toBe(
        'Version 5.5 shipped.',
      );
    });

    test('gives nothing when the first sentence is over the cap', () => {
      expect(feedExcerpt('A very long sentence indeed.', 10)).toBeUndefined();
    });
  });
});
