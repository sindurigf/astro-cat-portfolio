import { readFileSync } from 'node:fs';
import { get, type IncomingHttpHeaders } from 'node:http';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createTestHarness, type TestHarness } from 'wrangler';
import { expect, test } from './test';
import { wranglerConfig } from './source';
import {
  acceptsGzip,
  COMPRESSED_PAGE_PATHS,
  isCompressedPage,
  serveCompressedPage,
} from '../src/lib/html-compression';

const PAGE = '<!doctype html><title>Page</title>'.repeat(200);
const ETAG = '"page"';
const PAGE_URL = 'https://example.test/brand/';

test.describe('acceptsGzip', () => {
  for (const [header, expected] of [
    ['gzip', true],
    ['gzip, deflate, br, zstd', true],
    ['br;q=1.0, GZIP;q=0.5', true],
    ['*', true],
    ['br, *;q=0.1', true],
    [null, false],
    ['', false],
    ['identity', false],
    ['br, zstd', false],
    ['gzip;q=0', false],
    ['gzip;q=0, *', false],
    ['*;q=0', false],
  ] as const) {
    test(`${JSON.stringify(header)} is ${expected ? 'gzip' : 'identity'}`, () => {
      expect(acceptsGzip(header)).toBe(expected);
    });
  }
});

test.describe('serveCompressedPage, against an in-memory page', () => {
  const forwarded: Request[] = [];
  const assets = (status = 200, contentType = 'text/html; charset=utf-8') => ({
    fetch: async (request: Request): Promise<Response> => {
      forwarded.push(request);
      const notModified = request.headers.get('If-None-Match') === ETAG;
      return new Response(notModified ? null : PAGE, {
        status: notModified ? 304 : status,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(PAGE.length),
          ETag: ETAG,
          'Cache-Control': 'no-transform',
        },
      });
    },
  });
  test.afterEach(() => {
    forwarded.length = 0;
  });

  const serve = (headers: Record<string, string>, binding = assets()) =>
    serveCompressedPage(new Request(PAGE_URL, { headers }), binding);

  test('a gzip client gets the page gzipped with a weak ETag', async () => {
    const response = await serve({ 'Accept-Encoding': 'gzip, br' });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Encoding')).toBe('gzip');
    expect(response.headers.get('Content-Length')).toBeNull();
    expect(response.headers.get('Vary')).toContain('Accept-Encoding');
    expect(response.headers.get('ETag')).toBe(`W/${ETAG}`);
    expect(response.headers.get('Cache-Control')).toBe('no-transform');
    const body = Buffer.from(await response.arrayBuffer());
    expect(gunzipSync(body).toString(), 'the gzip body is not the page.').toBe(
      PAGE,
    );
    expect(
      forwarded[0]?.headers.get('Accept-Encoding'),
      'the asset layer was asked for an encoded body, which would be gzipped twice.',
    ).toBeNull();
  });

  test('the weak ETag it sent revalidates to a 304', async () => {
    const response = await serve({
      'Accept-Encoding': 'gzip',
      'If-None-Match': `W/${ETAG}`,
    });

    expect(response.status).toBe(304);
    expect(response.headers.get('Content-Encoding')).toBeNull();
    expect(response.headers.get('ETag')).toBe(`W/${ETAG}`);
  });

  test('a client without gzip gets the page as stored, still varying', async () => {
    const response = await serve({ 'Accept-Encoding': 'br' });

    expect(response.headers.get('Content-Encoding')).toBeNull();
    expect(response.headers.get('ETag')).toBe(ETAG);
    expect(response.headers.get('Vary')).toContain('Accept-Encoding');
    expect(await response.text()).toBe(PAGE);
  });

  test('a 404 or a non-HTML body passes through unencoded', async () => {
    for (const binding of [assets(404), assets(200, 'text/plain')]) {
      const response = await serve({ 'Accept-Encoding': 'gzip' }, binding);
      expect(response.headers.get('Content-Encoding')).toBeNull();
      expect(await response.text()).toBe(PAGE);
    }
  });
});

test.describe('compressed page routing', () => {
  test('isCompressedPage takes the listed paths and nothing else', () => {
    const at = (path: string) =>
      isCompressedPage(new Request(`https://x.test${path}`));
    for (const path of COMPRESSED_PAGE_PATHS) expect(at(path)).toBe(true);
    expect(at('/brand')).toBe(false);
    expect(at('/brand/index.html')).toBe(false);
    expect(at('/career/')).toBe(false);
  });

  test('wrangler.jsonc runs the Worker first for every compressed page', () => {
    const config = wranglerConfig<{
      assets?: { run_worker_first?: string[] };
    }>();
    for (const path of COMPRESSED_PAGE_PATHS) {
      expect(
        config.assets?.run_worker_first ?? [],
        `${path} is served by the asset layer, uncompressed.`,
      ).toContain(path);
    }
  });
});

/*
 * The built Worker in workerd, read over raw HTTP: Playwright's request and the
 * preview proxy both decode gzip, which would hide the encoding under test.
 */
test.describe('the built Worker gzips the compressed pages', () => {
  const SERVER_DIR = 'dist/server';
  let server: TestHarness;
  let origin: URL;

  test.beforeAll(async () => {
    const built = JSON.parse(
      readFileSync(join(SERVER_DIR, 'wrangler.json'), 'utf8'),
    );
    server = createTestHarness({
      root: SERVER_DIR,
      workers: [
        {
          config: {
            name: built.name,
            main: built.main,
            compatibility_date: built.compatibility_date,
            compatibility_flags: built.compatibility_flags,
            rules: built.rules,
            no_bundle: built.no_bundle,
            assets: built.assets,
          },
        },
      ],
    });
    ({ url: origin } = await server.listen());
  });
  test.afterAll(async () => {
    await server.close();
  });

  const raw = (path: string, headers: Record<string, string>) =>
    new Promise<{
      status: number | undefined;
      headers: IncomingHttpHeaders;
      body: Buffer;
    }>((resolve, reject) => {
      get(new URL(path, origin), { headers }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks),
          }),
        );
      }).on('error', reject);
    });

  for (const path of COMPRESSED_PAGE_PATHS) {
    test(`${path} is gzip of the built page, with the site headers`, async () => {
      const page = readFileSync(join('dist/client', path, 'index.html'));
      const response = await raw(path, { 'Accept-Encoding': 'gzip, br' });

      expect(response.status).toBe(200);
      expect(response.headers['content-encoding']).toBe('gzip');
      expect(response.body.length).toBeLessThan(page.length);
      expect(
        gunzipSync(response.body).equals(page),
        'the gzip body is not the built page.',
      ).toBe(true);
      expect(response.headers['cache-control']).toContain('no-transform');
      expect(response.headers['content-security-policy']).toContain(
        "default-src 'self'",
      );

      const etag = String(response.headers.etag);
      expect(etag, 'a gzip body must not carry the strong ETag.').toMatch(
        /^W\//,
      );
      const revalidated = await raw(path, {
        'Accept-Encoding': 'gzip',
        'If-None-Match': etag,
      });
      expect(revalidated.status, 'the weak ETag never revalidates.').toBe(304);
    });
  }
});
