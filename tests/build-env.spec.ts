import { readFileSync } from 'node:fs';
import { expect, test } from './test';
import { readBuildEnv } from '../src/lib/build-env';
import { noindexHeaders } from '../src/lib/noindex-headers';
import { noindexRedirects } from '../src/lib/noindex-redirects';
import { NODE } from './tags';

/* Build correctness: a bad override fails the build, and a NOINDEX build cannot drop noindex. */

const HEADERS = readFileSync('public/_headers', 'utf8');
const REDIRECTS = readFileSync('public/_redirects', 'utf8');
const SITEMAP_ENTRY =
  '</sitemap-index.xml>; rel="sitemap"; type="application/xml"';

test.describe('readBuildEnv', NODE, () => {
  test('unset or empty variables leave src/site.config.ts as it is', () => {
    const defaults = {
      siteUrl: null,
      contactForm: null,
      noindex: false,
      repositoryUrl: null,
    };

    expect(readBuildEnv({})).toEqual(defaults);
    expect(
      readBuildEnv({
        SITE_URL: '',
        CONTACT_FORM: '',
        NOINDEX: '',
        REPOSITORY_URL: '',
      }),
    ).toEqual(defaults);
  });

  test('accepts the demo values', () => {
    expect(
      readBuildEnv({
        SITE_URL: 'https://demo.example.com',
        CONTACT_FORM: 'none',
        NOINDEX: '1',
        REPOSITORY_URL: 'https://github.com/demo-owner/demo-site',
      }),
    ).toEqual({
      siteUrl: 'https://demo.example.com',
      contactForm: 'none',
      noindex: true,
      repositoryUrl: 'https://github.com/demo-owner/demo-site',
    });
  });

  for (const [name, value] of [
    ['SITE_URL', 'demo.example.com'],
    ['SITE_URL', 'http://demo.example.com'],
    ['SITE_URL', 'https://demo.example.com/'],
    ['SITE_URL', 'https://demo.example.com/path'],
    ['SITE_URL', 'https://Demo.example.com'],
    ['CONTACT_FORM', 'off'],
    ['NOINDEX', 'true'],
    ['NOINDEX', '0'],
    ['REPOSITORY_URL', 'github.com/demo-owner/demo-site'],
    ['REPOSITORY_URL', 'http://github.com/demo-owner/demo-site'],
    ['REPOSITORY_URL', 'https://github.com/demo-owner/demo-site/'],
    ['REPOSITORY_URL', 'https://github.com/demo-owner/demo-site?tab=readme'],
    ['REPOSITORY_URL', 'https://github.com'],
  ] as const) {
    test(`rejects ${name}=${value}`, () => {
      expect(() => readBuildEnv({ [name]: value })).toThrow(
        `${name}=${value} `,
      );
    });
  }
});

test.describe('noindexHeaders', NODE, () => {
  test('adds noindex to the global rule and drops only the sitemap link', () => {
    const rewritten = noindexHeaders(HEADERS);
    const global = rewritten.split('\n/_astro/*')[0]!;

    expect(global, 'the global rule has no noindex.').toMatch(
      /^\/\*\n {2}X-Robots-Tag: noindex$/m,
    );
    expect(global, 'the sitemap is still advertised.').not.toContain(
      SITEMAP_ENTRY,
    );
    expect(
      rewritten
        .replace('  X-Robots-Tag: noindex\n', '')
        .replace(`${SITEMAP_ENTRY}, `, ''),
      'something other than noindex and the sitemap link changed.',
    ).toBe(HEADERS.replace(`${SITEMAP_ENTRY}, `, ''));
  });

  for (const [why, source] of [
    ['no global rule', HEADERS.replace(/^\/\*$/m, '/blog/*')],
    ['no sitemap link', HEADERS.replace(`${SITEMAP_ENTRY}, `, '')],
    ['no Link header', HEADERS.replace(/^ {2}Link:.*$/m, '')],
    [
      'noindex already set',
      HEADERS.replace(/^\/\*$/m, '/*\n  X-Robots-Tag: none'),
    ],
  ] as const) {
    test(`fails the build on ${why}`, () => {
      expect(() => noindexHeaders(source)).toThrow('public/_headers:');
    });
  }
});

test.describe('noindexRedirects', NODE, () => {
  test('drops only the redirect to the sitemap', () => {
    const rewritten = noindexRedirects(REDIRECTS);

    expect(rewritten, 'the sitemap redirect is still there.').not.toMatch(
      /^\/sitemap\.xml\s/m,
    );
    expect(
      rewritten,
      'something other than the sitemap redirect changed.',
    ).toBe(
      REDIRECTS.split('\n')
        .filter((line) => !line.startsWith('/sitemap.xml '))
        .join('\n'),
    );
  });

  test('fails the build when there is no sitemap redirect', () => {
    expect(() =>
      noindexRedirects(REDIRECTS.replace(/^\/sitemap\.xml .*$/m, '')),
    ).toThrow('public/_redirects:');
  });
});
