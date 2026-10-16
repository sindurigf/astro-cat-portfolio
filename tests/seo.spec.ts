import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contactDescription } from '../src/lib/contact';
import { SOCIAL_PROFILES } from '../src/lib/profiles';
import { BING_SITE_VERIFICATION, bingVerificationFor } from '../src/lib/site';
import { SITE_CONFIG, validateSiteConfig } from '../src/site.config';
import { expect, test } from './test';
import { configuredSite, pngSize } from './source';
import {
  postFrontmatter,
  builtHtml as builtHtmlByRoute,
  DIST_DIR,
  POST_ROUTES,
  PUBLISHED_POST_ROUTES,
  TAG_ROUTES,
  TALK_ROUTES,
  postFileNames,
} from './routes';
import { NODE } from './tags';
import { metaContent } from './html';
import {
  OG_CARD_MANIFEST,
  SITE_CARD_ROUTES,
  cardPhoto,
  decodeEntities,
  ogCardPath,
  type OgCardManifest,
} from '../src/lib/og-cards';

const SITE_ORIGIN = configuredSite();

const BING_META = 'msvalidate.01';
const SAMPLE_BING_CODE = '0123456789ABCDEF0123456789ABCDEF';

// Called inside tests, never at module scope: collection precedes the build.
const builtHtml = (): { route: string; html: string }[] =>
  [...builtHtmlByRoute()].map(([route, html]) => ({ route, html }));

/**
 * The only comments the build may emit: Vue's fragment and empty-node markers,
 * which hydration needs, and Astro's island end marker.
 */
const FRAMEWORK_COMMENTS = new Set([
  '<!--[-->',
  '<!--]-->',
  '<!---->',
  '<!--astro:end-->',
]);
const SHOWN_COMMENTS = 10;
const COMMENT_PREVIEW_CHARS = 60;

test.describe('built HTML', NODE, () => {
  // Astro emits <!-- --> template comments verbatim; JSX-style ones not.
  test('carries no authored HTML comments', () => {
    const comments = builtHtml().flatMap(({ route, html }) =>
      (html.match(/<!--[\s\S]*?-->/g) ?? []).map((comment) => ({
        route,
        comment,
      })),
    );
    expect(
      comments.length,
      'no comments found at all, so the scan is not reading the build',
    ).toBeGreaterThan(0);

    const authored = comments.filter(
      ({ comment }) => !FRAMEWORK_COMMENTS.has(comment),
    );
    expect(
      authored
        .slice(0, SHOWN_COMMENTS)
        .map(
          ({ route, comment }) =>
            `${route}: ${comment.slice(0, COMMENT_PREVIEW_CHARS)}`,
        ),
      `${authored.length} authored comment(s) in the build, first ${SHOWN_COMMENTS} shown`,
    ).toEqual([]);
  });
});

const HEADING = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;

test.describe('headings', NODE, () => {
  // A <br> runs the lines together in the heading's text; use block spans.
  test('no heading is split with <br>', () => {
    const headings = builtHtml().flatMap(({ route, html }) =>
      [...html.matchAll(HEADING)].map(([, level, inner]) => ({
        name: `${route} h${level}`,
        inner: inner ?? '',
      })),
    );

    expect(headings.length, 'no headings found in the build').toBeGreaterThan(
      0,
    );
    expect(
      headings.filter(({ inner }) => /<br\b/i.test(inner)).map((h) => h.name),
      'heading(s) split with <br>',
    ).toEqual([]);
  });
});

/** Open Graph and Twitter tags every page needs for a full link preview. */
const LINK_PREVIEW_TAGS = [
  'og:type',
  'og:site_name',
  'og:title',
  'og:description',
  'og:url',
  'og:locale',
  'og:image',
  'og:image:width',
  'og:image:height',
  'og:image:alt',
  'twitter:card',
  'twitter:image:alt',
] as const;

// X falls back to the `og:` tag when these are absent.
const TWITTER_COPIES = [
  'twitter:title',
  'twitter:description',
  'twitter:image',
] as const;

/* JPEG: a start-of-image marker, then segments until a start-of-frame one. */
const JPEG_SIGNATURE = 'ffd8';
const JPEG_FIRST_SEGMENT = 2;
const JPEG_MARKER_PREFIX = 0xff;
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const JPEG_SOF_HEIGHT_OFFSET = 5;
const JPEG_SOF_WIDTH_OFFSET = 7;
const JPEG_SEGMENT_LENGTH_OFFSET = 2;

/** An image file's pixel size as `WxH`, for PNG and JPEG; null for others. */
const imageSize = (bytes: Buffer): string | null => {
  const png = pngSize(bytes);
  if (png) return `${png.width}x${png.height}`;
  if (bytes.subarray(0, 2).toString('hex') !== JPEG_SIGNATURE) return null;

  let offset = JPEG_FIRST_SEGMENT;
  while (offset + JPEG_SOF_WIDTH_OFFSET + 1 < bytes.length) {
    if (bytes[offset] !== JPEG_MARKER_PREFIX) return null;
    const marker = bytes[offset + 1]!;
    if (JPEG_SOF_MARKERS.has(marker)) {
      return `${bytes.readUInt16BE(offset + JPEG_SOF_WIDTH_OFFSET)}x${bytes.readUInt16BE(offset + JPEG_SOF_HEIGHT_OFFSET)}`;
    }
    offset +=
      JPEG_SEGMENT_LENGTH_OFFSET +
      bytes.readUInt16BE(offset + JPEG_SEGMENT_LENGTH_OFFSET);
  }
  return null;
};

/** The site card: the homepage and the 404 share it. */
const DEFAULT_OG_IMAGE_URL = `${SITE_ORIGIN}/images/og-default.png`;

test.describe('link previews', NODE, () => {
  test('every page carries every link-preview tag', () => {
    const pages = builtHtml();
    expect(pages.length, 'no pages found in the build').toBeGreaterThan(0);

    // A page with no canonical (the 404, served at every dead URL) has no URL to name.
    const hasCanonical = (html: string): boolean =>
      /<link[^>]+rel="canonical"/i.test(html);
    const missing = pages.flatMap(({ route, html }) =>
      LINK_PREVIEW_TAGS.filter(
        (key) => !(key === 'og:url' && !hasCanonical(html)),
      )
        .filter((key) => !metaContent(html, key))
        .map((key) => `${route} ${key}`),
    );
    expect(missing, 'missing or empty link-preview tag(s)').toEqual([]);

    const strayUrls = pages
      .filter(({ html }) => !hasCanonical(html) && metaContent(html, 'og:url'))
      .map(({ route }) => route);
    expect(
      strayUrls,
      'a page with no canonical advertises an og:url, so a share of a dead ' +
        'link previews as whichever route the 404 was built at.',
    ).toEqual([]);
  });

  test('og:title leaves the site name to og:site_name', () => {
    const suffixed = builtHtml()
      .filter(({ html }) => {
        const siteName = metaContent(html, 'og:site_name');
        return (
          siteName && metaContent(html, 'og:title')?.endsWith(` | ${siteName}`)
        );
      })
      .map(({ route }) => route);
    expect(
      suffixed,
      'og:title repeats og:site_name, so previews show the site name twice.',
    ).toEqual([]);
  });

  test('no page repeats an og: tag as a twitter: one', () => {
    const repeated = builtHtml().flatMap(({ route, html }) =>
      TWITTER_COPIES.filter((key) => metaContent(html, key) !== null).map(
        (key) => `${route} ${key}`,
      ),
    );

    expect(
      repeated,
      'X falls back to the og: tag, so these twitter: copies are redundant.',
    ).toEqual([]);
  });

  test('every og:image is the size it declares', () => {
    const wrong = builtHtml().flatMap(({ route, html }) => {
      const url = metaContent(html, 'og:image');
      if (!url) return [];
      const bytes = readFileSync(join(DIST_DIR, new URL(url).pathname));
      const actual = imageSize(bytes);
      if (actual === null) {
        return [`${route}: ${url} is not a PNG or a JPEG`];
      }
      const declared = `${metaContent(html, 'og:image:width')}x${metaContent(html, 'og:image:height')}`;
      return actual === declared
        ? []
        : [`${route}: declares ${declared}, ${url} is ${actual}`];
    });
    expect(wrong, 'og:image size mismatch(es)').toEqual([]);
  });

  test('every page shares the card drawn from its current title and photo', () => {
    const manifest = JSON.parse(
      readFileSync(join('public', OG_CARD_MANIFEST), 'utf8'),
    ) as OgCardManifest;
    const stale = builtHtml().flatMap(({ route, html }) => {
      const url = metaContent(html, 'og:image');
      const hasCanonical = /<link[^>]+rel="canonical"/i.test(html);
      if (!hasCanonical || SITE_CARD_ROUTES.includes(route)) {
        return url === DEFAULT_OG_IMAGE_URL
          ? []
          : [`${route}: shares ${url}, not the site card`];
      }
      const card = manifest[route];
      const photo = cardPhoto(route, html)?.src ?? null;
      const title = decodeEntities(metaContent(html, 'og:title') ?? '');
      const problems = [
        !card && 'has no card',
        card &&
          card.title !== title &&
          `card title "${card.title}" is not "${title}"`,
        card &&
          card.photo !== photo &&
          `card photo ${card.photo} is not ${photo}`,
        url !== `${SITE_ORIGIN}/${ogCardPath(route)}` && `shares ${url}`,
        card &&
          decodeEntities(metaContent(html, 'og:image:alt') ?? '') !==
            card.alt &&
          'og:image:alt is not the card alt',
      ].filter(Boolean);
      return problems.map((problem) => `${route}: ${problem}`);
    });
    expect(
      stale,
      'a card is missing or stale: run `npm run build && npm run og`, then commit public/images/og/.',
    ).toEqual([]);
  });
});

/**
 * Same-origin page links from <a href>: root-relative or on SITE_ORIGIN, with
 * any query or fragment dropped. Files (a dot in the last segment) are skipped.
 */
const internalPageLinks = (html: string): string[] =>
  [...html.matchAll(/<a\b[^>]*\shref=["']([^"']*)["']/gi)]
    .map(([, href]) => (href ?? '').split(/[?#]/)[0] ?? '')
    .map((href) =>
      href.startsWith(SITE_ORIGIN)
        ? href.slice(SITE_ORIGIN.length) || '/'
        : href,
    )
    .filter((href) => href.startsWith('/') && !href.startsWith('//'))
    .filter((href) => !(href.split('/').pop() ?? '').includes('.'));

test.describe('article previews', NODE, () => {
  test('only posts say og:type article, with their published date', () => {
    for (const { route, html } of builtHtml()) {
      const isPost = PUBLISHED_POST_ROUTES.includes(route.replace(/\/$/, ''));
      expect
        .soft(metaContent(html, 'og:type'), `${route} og:type`)
        .toBe(isPost ? 'article' : 'website');
      expect
        .soft(
          metaContent(html, 'article:published_time'),
          `${route} article:published_time`,
        )
        .toBe(
          isPost
            ? `${/<time datetime="([^"]+)"/.exec(html)?.[1] ?? ''}T00:00:00Z`
            : null,
        );
    }
  });
});

test.describe('internal links', NODE, () => {
  // Unslashed links redirect in production, which a browser follows silently.
  test('every internal page link ends with a slash', () => {
    const links = builtHtml().flatMap(({ route, html }) =>
      internalPageLinks(html).map((href) => ({ route, href })),
    );
    expect(links.length, 'no internal page links found').toBeGreaterThan(0);

    const unslashed = new Map<string, number>();
    for (const { href } of links.filter(({ href }) => !href.endsWith('/'))) {
      unslashed.set(href, (unslashed.get(href) ?? 0) + 1);
    }
    expect(
      [...unslashed].map(([href, count]) => `${href} (${count} links)`),
      'internal link(s) without a trailing slash, each a 307 in production',
    ).toEqual([]);
  });
});

// Pages no search result shows (noindex, not in sitemap) skip the floor.
test.describe('search results', NODE, () => {
  const MIN_DESCRIPTION = 50;
  const MAX_DESCRIPTION = 160;
  const MAX_TITLE = 70;

  const UNLISTED = ['/404', '/contact/sent', ...TAG_ROUTES];

  test('the 404 page asks not to be indexed', () => {
    const notFound = builtHtml().find(
      ({ route }) => route.replace(/\/$/, '') === '/404',
    );
    expect(notFound, '/404 was not built').toBeDefined();
    expect(
      metaContent(notFound!.html, 'robots'),
      '/404 answers 200 at its own address and asks to be indexed.',
    ).toMatch(/noindex/);
  });

  const tallyDescriptions = () => {
    const short: string[] = [];
    const long: string[] = [];
    const missing: string[] = [];
    const byDescription = new Map<string, string[]>();

    for (const { route, html } of builtHtml()) {
      const description = metaContent(html, 'description');

      if (description === null || description === '') {
        missing.push(route);
        continue;
      }

      byDescription.set(description, [
        ...(byDescription.get(description) ?? []),
        route,
      ]);

      if (description.length > MAX_DESCRIPTION) {
        long.push(`${route} (${description.length})`);
      }
      if (
        description.length < MIN_DESCRIPTION &&
        !UNLISTED.includes(route.replace(/\/$/, ''))
      ) {
        short.push(`${route} (${description.length})`);
      }
    }

    return { short, long, missing, byDescription };
  };

  test('every route describes itself in its own words', () => {
    const { short, long, missing, byDescription } = tallyDescriptions();

    expect(missing, 'route(s) with no description').toEqual([]);
    expect(long, `description(s) over ${MAX_DESCRIPTION} characters`).toEqual(
      [],
    );
    expect(short, `description(s) under ${MIN_DESCRIPTION} characters`).toEqual(
      [],
    );

    const shared = [...byDescription].filter(([, routes]) => routes.length > 1);
    expect(
      shared.map(
        ([description, routes]) => `${routes.join(', ')}: ${description}`,
      ),
      'route(s) sharing a description',
    ).toEqual([]);
  });

  test('no title is long enough to be cut in a result', () => {
    const long = builtHtml()
      .map(({ route, html }) => ({
        route,
        title: /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '',
      }))
      .filter(({ title }) => title.length > MAX_TITLE)
      .map(({ route, title }) => `${route} (${title.length})`);

    expect(long, `title(s) over ${MAX_TITLE} characters`).toEqual([]);
  });
});

test.describe("/contact's description", NODE, () => {
  test('names the services passed in, and the form only when it is on', () => {
    expect(contactDescription('Jane Doe', ['Mastodon'], false)).toBe(
      'Write to Jane Doe by email or on Mastodon.',
    );
    expect(contactDescription('Jane Doe', [], true)).toBe(
      'Write to Jane Doe by email, or with the contact form.',
    );
  });

  test('names every profile the page offers a card for', () => {
    const html = builtHtmlByRoute().get('/contact')!;
    const description = metaContent(html, 'description') ?? '';
    const offered = SOCIAL_PROFILES.filter(({ href }) =>
      new RegExp(`<a\\b[^>]*href="${href}"[^>]*class="[^"]*lift-object`).test(
        html,
      ),
    ).map(({ label }) => label);

    expect(offered.length, '/contact offers no profile card').toBeGreaterThan(
      0,
    );
    for (const label of offered) {
      expect(description, `the description leaves out ${label}`).toContain(
        label,
      );
    }
  });
});

// Asserted as a pairing so it still holds with no placeholder post present.
test.describe(
  'a placeholder post is not offered to a search engine',
  NODE,
  () => {
    const placeholderPosts = (): Set<string> => {
      const placeholders = new Set<string>();
      for (const name of postFileNames()) {
        if (!name.endsWith('.md')) continue;
        if (/^placeholder:\s*true\s*$/m.test(postFrontmatter(name))) {
          placeholders.add(`/blog/${name.replace(/\.md$/, '')}`);
        }
      }
      return placeholders;
    };

    test('every post asks to be indexed unless it is a placeholder', () => {
      const placeholders = placeholderPosts();
      const pages = builtHtmlByRoute();

      for (const route of POST_ROUTES) {
        const html = pages.get(route);
        expect(html, `${route} was not built`).toBeDefined();

        const asksNotToBeIndexed = /<meta[^>]+name="robots"[^>]+noindex/i.test(
          html ?? '',
        );

        expect(
          asksNotToBeIndexed,
          placeholders.has(route)
            ? `${route} is a placeholder and still asks to be indexed.`
            : `${route} is a real post and asks not to be indexed.`,
        ).toBe(placeholders.has(route));
      }
    });

    // llms.txt lists placeholders on purpose, and is not HTML.
    test('nothing links to a placeholder post', () => {
      const placeholders = placeholderPosts();
      test.skip(
        placeholders.size === 0,
        'no post is a placeholder, so there is no link to find',
      );
      const offered: string[] = [];

      for (const [route, html] of builtHtmlByRoute()) {
        if (placeholders.has(route)) continue;
        for (const placeholder of placeholders) {
          if (html.includes(`href="${placeholder}/"`)) {
            offered.push(`${route} links ${placeholder}`);
          }
        }
      }

      expect(offered, 'a listing links a placeholder post.').toEqual([]);
    });

    test('the sitemap lists a post only while it is not a placeholder', () => {
      const placeholders = placeholderPosts();
      const sitemap = readFileSync(join(DIST_DIR, 'sitemap-0.xml'), 'utf8');

      for (const route of POST_ROUTES) {
        expect(
          sitemap.includes(`${SITE_ORIGIN}${route}/`),
          placeholders.has(route)
            ? `the sitemap advertises ${route}, a noindex placeholder.`
            : `the sitemap has lost ${route}, a real post.`,
        ).toBe(!placeholders.has(route));
      }
    });
  },
);

test.describe('profile verification', NODE, () => {
  test('every page marks the footer profile links rel="me"', () => {
    const missing = builtHtml().flatMap(({ route, html }) => {
      const footer = html.slice(html.lastIndexOf('<footer'));
      return SOCIAL_PROFILES.filter(({ href }) => {
        const anchor = footer.match(
          new RegExp(
            `<a\\b[^>]*href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`,
          ),
        )?.[0];
        return !anchor || !/\brel="me"/.test(anchor);
      }).map(({ label }) => `${route} ${label}`);
    });
    expect(
      missing,
      'a profile link lacks rel="me", so Mastodon cannot verify the site.',
    ).toEqual([]);
  });

  test('the Bing Webmaster Tools tag is on the homepage only, and only when a code is set', () => {
    const carrying = builtHtml()
      .filter(({ html }) => metaContent(html, BING_META) !== null)
      .map(({ route, html }) => `${route} ${metaContent(html, BING_META)}`);
    expect(
      carrying,
      `${BING_META} does not match bingSiteVerification in src/site.config.ts.`,
    ).toEqual(
      BING_SITE_VERIFICATION === null ? [] : [`/ ${BING_SITE_VERIFICATION}`],
    );
  });

  test('a Bing verification code reaches the homepage and no other route', () => {
    const routes = builtHtml().map(({ route }) => route);
    expect(
      routes.filter(
        (route) => bingVerificationFor(route, SAMPLE_BING_CODE) !== null,
      ),
      'a set code does not reach the homepage alone.',
    ).toEqual(['/']);
    expect(
      bingVerificationFor('/', SAMPLE_BING_CODE),
      'the homepage does not carry the code as set.',
    ).toBe(SAMPLE_BING_CODE);
    expect(
      routes.filter((route) => bingVerificationFor(route, null) !== null),
      'a route carries a code though none is set.',
    ).toEqual([]);
  });

  test('bingSiteVerification must be null or 32 hexadecimal characters', () => {
    for (const bingSiteVerification of [
      '',
      SAMPLE_BING_CODE.slice(1),
      `${SAMPLE_BING_CODE}0`,
      SAMPLE_BING_CODE.replace('0', 'G'),
      ` ${SAMPLE_BING_CODE}`,
    ]) {
      expect(
        () => validateSiteConfig({ ...SITE_CONFIG, bingSiteVerification }),
        `bingSiteVerification "${bingSiteVerification}" passed validation.`,
      ).toThrow(/bingSiteVerification must be null or the 32 hexadecimal/);
    }
    for (const bingSiteVerification of [
      null,
      SAMPLE_BING_CODE,
      SAMPLE_BING_CODE.toLowerCase(),
    ]) {
      expect(() =>
        validateSiteConfig({ ...SITE_CONFIG, bingSiteVerification }),
      ).not.toThrow();
    }
  });
});

test.describe('talks', NODE, () => {
  test('each talk page links back to its post', () => {
    const pages = new Map(builtHtml().map(({ route, html }) => [route, html]));
    for (const route of TALK_ROUTES) {
      const slug = route.split('/').pop()!;
      const html = pages.get(route) ?? pages.get(`${route}/`) ?? '';
      expect(
        html.includes(`<a href="/blog/${slug}/">`),
        `${route} does not link its post, so it leads nowhere but the slides.`,
      ).toBe(true);
    }
  });
});
