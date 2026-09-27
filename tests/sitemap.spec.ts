import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import {
  frontmatterDay,
  postFrontmatter,
  builtHtml,
  builtPages,
  DIST_DIR,
  POST_ROUTES,
  PUBLISHED_POST_ROUTES,
  routesFromBuild,
  TAG_ROUTES,
} from './routes';
import { configuredSite } from './source';
import { NODE } from './tags';

/**
 * robots.txt, the sitemap, and the three places that name the sitemap file.
 * Reads dist/, not a browser; the origin is `site` in astro.config.mjs.
 */

const ROBOTS_FILE = join(DIST_DIR, 'robots.txt');

/** @astrojs/sitemap writes an index plus numbered files, not `sitemap.xml`. */
const SITEMAP_PATH = '/sitemap-index.xml';

/* `/404` is dropped by the integration; the rest by src/lib/sitemap-filter.ts. */
const EXCLUDED_ROUTES: string[] = [
  '/404',
  '/contact/sent',
  ...TAG_ROUTES,
  ...POST_ROUTES.filter((route) => !PUBLISHED_POST_ROUTES.includes(route)),
];

/** Every `<loc>` in the built sitemap, as pathnames, sorted. */
const sitemapPaths = (origin: string): string[] => {
  const index = join(DIST_DIR, SITEMAP_PATH.slice(1));
  expect(
    existsSync(index),
    `${index} was not built; is @astrojs/sitemap still in astro.config.mjs?`,
  ).toBe(true);

  // Follow the index, not sitemap-0.xml, so a second file is covered.
  const indexXml = readFileSync(index, 'utf8');
  const parts = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1]!,
  );

  expect(parts.length, `${index} names no sitemap files`).toBeGreaterThan(0);

  const paths: string[] = [];

  for (const part of parts) {
    const file = join(DIST_DIR, new URL(part).pathname.slice(1));
    expect(
      existsSync(file),
      `the sitemap index names ${part}, which the build did not write`,
    ).toBe(true);

    for (const match of readFileSync(file, 'utf8').matchAll(
      /<loc>([^<]+)<\/loc>/g,
    )) {
      const loc = match[1]!;

      expect(
        loc.startsWith(`${origin}/`),
        `${loc} is not an absolute URL under ${origin}.`,
      ).toBe(true);

      paths.push(new URL(loc).pathname);
    }
  }

  return paths.sort();
};

/** Routes as the sitemap spells them: with a trailing slash, bar the root. */
const asSitemapPath = (route: string): string =>
  route === '/' ? '/' : `${route}/`;

test.describe('robots.txt and the sitemap', NODE, () => {
  test('robots.txt points at a sitemap that exists', () => {
    expect(
      existsSync(ROBOTS_FILE),
      `${ROBOTS_FILE} was not built by src/pages/robots.txt.ts.`,
    ).toBe(true);

    const robots = readFileSync(ROBOTS_FILE, 'utf8');
    const origin = configuredSite();

    expect(robots, 'robots.txt does not allow all user agents.').toMatch(
      /^User-agent:\s*\*$/m,
    );

    const sitemapLine = /^Sitemap:\s*(\S+)$/m.exec(robots);
    expect(sitemapLine, 'robots.txt has no Sitemap line.').not.toBeNull();

    const declared = sitemapLine![1]!;

    // Crawlers skip a relative Sitemap line: robots.txt gives it no base.
    expect(
      declared,
      `the Sitemap line "${declared}" is not the absolute sitemap URL.`,
    ).toBe(`${origin}${SITEMAP_PATH}`);

    expect(
      existsSync(join(DIST_DIR, SITEMAP_PATH.slice(1))),
      `robots.txt advertises ${declared}, which the build did not write.`,
    ).toBe(true);
  });

  test('robots.txt keeps AI training crawlers out and search crawlers in', () => {
    const robots = readFileSync(ROBOTS_FILE, 'utf8');
    const groups = robots.split(/\n\s*\n/).map((group) => group.trim());

    for (const agent of [
      'GPTBot',
      'ClaudeBot',
      'CCBot',
      'Google-Extended',
      'Applebot-Extended',
    ]) {
      expect(groups, `robots.txt does not disallow ${agent}.`).toContain(
        `User-agent: ${agent}\nDisallow: /`,
      );
    }

    expect(
      groups.find((group) => group.startsWith('User-agent: *')),
      'robots.txt no longer allows every other crawler.',
    ).toMatch(/^User-agent: \*\nAllow: \/$/m);
  });

  test('all three agree on the sitemap URL', () => {
    const robots = readFileSync(ROBOTS_FILE, 'utf8');
    const declared = /^Sitemap:\s*(\S+)$/m.exec(robots)?.[1] ?? '';

    expect(
      new URL(declared).pathname,
      'robots.txt and the build disagree about where the sitemap is',
    ).toBe(SITEMAP_PATH);

    // Every page, not a sample: a route that drops BaseLayout loses the link.
    for (const page of builtPages()) {
      const html = readFileSync(page.file, 'utf8');
      const link = /<link[^>]*rel=["']sitemap["'][^>]*>/i.exec(html);

      expect(
        link,
        `${page.route} has no <link rel="sitemap">; has it stopped using BaseLayout?`,
      ).not.toBeNull();

      const href = /href=["']([^"']+)["']/i.exec(link![0])?.[1];
      expect(
        href,
        `${page.route} points its sitemap link at ${href}, not ${SITEMAP_PATH}.`,
      ).toBe(SITEMAP_PATH);
    }
  });

  test('the sitemap lists every page and only pages', () => {
    const origin = configuredSite();
    const listed = sitemapPaths(origin);

    const expected = routesFromBuild()
      .filter((route) => !EXCLUDED_ROUTES.includes(route))
      .map(asSitemapPath)
      .sort();

    expect(listed, 'the sitemap and the built pages have drifted.').toEqual(
      expected,
    );
  });

  test('every page kept out of the sitemap says noindex itself', () => {
    const listed = sitemapPaths(configuredSite());
    const pages = builtHtml();

    for (const route of EXCLUDED_ROUTES) {
      expect(
        listed.includes(asSitemapPath(route)),
        `the sitemap advertises ${route}, which asks not to be indexed`,
      ).toBe(false);

      expect(
        /<meta name="robots" content="([^"]*)">/.exec(
          pages.get(route) ?? '',
        )?.[1],
        `${route} is kept out of the sitemap but does not say noindex.`,
      ).toBe('noindex, follow');
    }
  });
});

// Posts carry `updated` or `date`; other pages record no date, so get none.
test.describe('the sitemap dates what it can', NODE, () => {
  const postDay = (slug: string, field: string): string | undefined =>
    frontmatterDay(postFrontmatter(slug), field);

  const entries = (): Map<string, string | undefined> => {
    const xml = readFileSync(join(DIST_DIR, 'sitemap-0.xml'), 'utf8');
    const found = new Map<string, string | undefined>();
    for (const entry of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
      const loc = /<loc>([^<]*)<\/loc>/.exec(entry)?.[1] ?? '';
      const lastmod = /<lastmod>([^<]*)<\/lastmod>/.exec(entry)?.[1];
      found.set(new URL(loc).pathname.replace(/\/$/, '') || '/', lastmod);
    }
    return found;
  };

  test('every post carries the day it last changed', () => {
    const found = entries();
    const wrong: string[] = [];

    for (const route of PUBLISHED_POST_ROUTES) {
      const slug = route.split('/').pop()!;
      const expected = postDay(slug, 'updated') ?? postDay(slug, 'date');
      const lastmod = found.get(route);

      if (lastmod === undefined) {
        wrong.push(`${route} has no lastmod`);
      } else if (expected === undefined) {
        wrong.push(`${route} has no date in its frontmatter`);
      } else if (!lastmod.startsWith(expected)) {
        wrong.push(`${route} lastmod ${lastmod}, frontmatter ${expected}`);
      }
    }

    expect(
      wrong,
      'a post lastmod does not match its frontmatter date.',
    ).toEqual([]);
  });

  // Catches this file and sitemap-filter.ts both misreading `updated`.
  test('a post cannot have changed before it was published', () => {
    const found = entries();
    const wrong: string[] = [];

    for (const route of PUBLISHED_POST_ROUTES) {
      const published = postDay(route.split('/').pop()!, 'date');
      const lastmod = found.get(route);

      if (published === undefined) {
        wrong.push(`${route} has no date in its frontmatter`);
      } else if (
        lastmod !== undefined &&
        Date.parse(lastmod) < Date.parse(published)
      ) {
        wrong.push(`${route} lastmod ${lastmod}, published ${published}`);
      }
    }

    expect(
      wrong,
      'a lastmod predates publication, so it was not read from frontmatter.',
    ).toEqual([]);
  });

  test('a page whose last change is unknown carries no lastmod', () => {
    const found = entries();
    const invented = [...found]
      .filter(
        ([route, lastmod]) =>
          lastmod !== undefined && !PUBLISHED_POST_ROUTES.includes(route),
      )
      .map(([route]) => route);

    expect(
      invented,
      'a listing or hand-written page has a lastmod nothing recorded.',
    ).toEqual([]);
  });
});
