import { readdirSync } from 'node:fs';
import { test, expect } from './test';
import { PUBLISHED_POST_ROUTES } from './routes';
import { SITE_FEED_PATH } from '../src/lib/paths';

/* Run by playwright.worker.config.ts: only the Worker applies _headers and _redirects. HTTP only, no browser. */

const RULES = '/speculationrules.json';
const RULES_TYPE = 'application/speculationrules+json';
const [POST] = PUBLISHED_POST_ROUTES;

const PUBLIC_DIR = 'public';
const CLIENT_DIR = 'dist/client';
const PAGE = 'index.html';
const MOVED_PERMANENTLY = 301;

/** Every PDF the site publishes, as its served path. */
const publishedPdfs = (): string[] =>
  readdirSync(PUBLIC_DIR, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.pdf'))
    .map((file) => `/${file.split('\\').join('/')}`);

/** Every built page but the home page, as its slashed path. */
const builtPages = (): string[] =>
  readdirSync(CLIENT_DIR, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split('\\').join('/'))
    .filter((file) => file.endsWith(`/${PAGE}`))
    .map((file) => `/${file.slice(0, -PAGE.length)}`);

test.describe('served types', () => {
  test('the speculation rules file carries the type a browser requires', async ({
    request,
  }) => {
    const response = await request.get(RULES);
    expect(response.status()).toBe(200);
    expect(
      response.headers()['content-type'],
      `${RULES} must be served as ${RULES_TYPE}, or Chromium ignores it`,
    ).toBe(RULES_TYPE);
    expect(Object.keys(await response.json())).toEqual(['prefetch']);
  });

  test('a page names the rules file and the discovery links', async ({
    request,
  }) => {
    const headers = (await request.get('/')).headers();
    expect(headers['speculation-rules']).toBe(`"${RULES}"`);
    expect(headers.link).toContain('</llms.txt>; rel="describedby"');
  });

  test('every PDF is served, kept out of search and keeps the discovery links', async ({
    request,
  }) => {
    const pdfs = publishedPdfs();
    test.skip(pdfs.length === 0, 'public/ has no PDF');
    for (const path of pdfs) {
      const response = await request.get(path);
      expect(response.status(), `${path} status`).toBe(200);
      expect(response.headers()['x-robots-tag'], `${path} is indexable`).toBe(
        'noindex',
      );
      expect(response.headers().link, `${path} lost the Link header`).toContain(
        '</llms.txt>; rel="describedby"',
      );
    }
  });

  test('the feed carries an XML type', async ({ request }) => {
    const response = await request.get(SITE_FEED_PATH);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('xml');
  });

  test("a post's Markdown source carries the Markdown type", async ({
    request,
  }) => {
    test.skip(!POST, 'no published post, so no Markdown source is built');
    const path = `${POST}.md`;
    const response = await request.get(path);
    expect(response.status(), `${path} status`).toBe(200);
    expect(response.headers()['content-type'], `${path} type`).toContain(
      'text/markdown',
    );
  });
});

test.describe('unslashed page paths', () => {
  test('every page answers its unslashed path with a 301 to the slashed one, which serves it', async ({
    request,
  }) => {
    const pages = builtPages();
    expect(pages.length, `${CLIENT_DIR} has no page`).toBeGreaterThan(0);
    for (const page of pages) {
      const unslashed = page.slice(0, -1);
      const moved = await request.get(unslashed, { maxRedirects: 0 });
      expect(moved.status(), `${unslashed} is not a permanent redirect`).toBe(
        MOVED_PERMANENTLY,
      );
      expect(moved.headers().location, `${unslashed} goes elsewhere`).toBe(
        page,
      );
      const served = await request.get(page, { maxRedirects: 0 });
      expect(served.status(), `${page} is not served`).toBe(200);
    }
  });

  test('files at the root are served, not redirected', async ({ request }) => {
    for (const path of ['/llms.txt', SITE_FEED_PATH, '/robots.txt']) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), `${path} status`).toBe(200);
    }
  });
});
