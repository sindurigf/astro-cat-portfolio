import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { expect, test } from './test';
import { builtPages, DIST_DIR } from './routes';
import { UMAMI_HOST_URL, UMAMI_SCRIPT_PATH } from '../src/lib/analytics';
import { ANALYTICS_ON } from '../src/lib/analytics-site';
import { asServed, headersFor, MIME, type Rule } from './policy-server';
import { ASSET_CACHE_CONTROL, usePolicyServer } from './headers-fixture';
import { NODE } from './tags';

/** The rules as declared and as the policy server serves them; tests/headers.spec.ts covers browsers. */

/** The site-wide rule. Every header but the two asset ones is set here. */
const GLOBAL_PATTERN = '/*';

/** Vite's output: the only content-hashed path, so the only immutable one. */
const ASSET_PATTERN = '/_astro/*';

/** `/_astro/*` detaches `/*`'s value first; public/_headers says why. */
const JOINED_ON_PURPOSE = new Set(['cache-control']);

/** Blocks Cloudflare JavaScript Detections injection, and compression. */
const NO_TRANSFORM = 'no-transform';

/* Must match the /vendor/* rule in public/_headers. */
const VENDOR_CACHE_CONTROL = 'public, max-age=3600';

/** A detach deletes silently: `! Content-Security-Policy` on pages ships no CSP. */
const DETACHABLE = new Set(['cache-control']);

/** Built files that are not pages and may be compressed: no `no-transform`. */
const COMPRESSIBLE = /(^favicon\.|rss\.xml$)/;

/** Every header the site is expected to send, checked by name. */
const REQUIRED_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'referrer-policy',
  'x-content-type-options',
  'x-frame-options',
  'permissions-policy',
] as const;

/* Pinned, so weakening one fails: `unsafe-url` would send full URLs off-site. */
const PINNED_HEADERS = {
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
} as const;

/** Features the site never uses, each denied to every origin with `()`. */
const DENIED_FEATURES = [
  'camera',
  'microphone',
  'geolocation',
  'payment',
  'usb',
] as const;

/** 180 days, pinned exactly: browsers remember HSTS for `max-age`. */
const HSTS_MAX_AGE = 15_552_000;

/**
 * Types `script-src` does not gate, per the HTML "prepare the script element"
 * steps. Not every non-JS type: `importmap` and `speculationrules` are gated.
 */
const DATA_SCRIPT_TYPES = ['application/ld+json'];

const isDataBlock = (attributes: string): boolean => {
  const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
  return type !== undefined && DATA_SCRIPT_TYPES.includes(type.toLowerCase());
};

/** sha256-base64 of a string, in the form a CSP source expression takes. */
const cspHash = (body: string): string =>
  `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;

const htmlFiles = (): string[] => builtPages().map(({ file }) => file);

/** The URL path a built file is served at: `about/index.html` is `/about/`. */
const servedPath = (file: string): string =>
  `/${relative(DIST_DIR, file).split(sep).join('/')}`
    .replace(/(^|\/)index\.html$/, '$1')
    .replace(/\.html$/, '');

const builtFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? builtFiles(full) : [full];
  });

/** Every distinct inline <script> and <style> body across the whole build. */
const inlineBlocks = (): { scripts: Set<string>; styles: Set<string> } => {
  const scripts = new Set<string>();
  const styles = new Set<string>();

  for (const file of htmlFiles()) {
    const html = readFileSync(file, 'utf8');

    for (const match of html.matchAll(
      /<script\b([^>]*)>([\s\S]*?)<\/script>/g,
    )) {
      const attributes = match[1] ?? '';
      if (/\bsrc\s*=/.test(attributes)) continue;
      if (isDataBlock(attributes)) continue;
      scripts.add(match[2] ?? '');
    }

    for (const match of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
      styles.add(match[1] ?? '');
    }
  }

  return { scripts, styles };
};

const directive = (csp: string, name: string): string => {
  const found = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));

  expect(found, `the CSP has no ${name} directive:\n  ${csp}`).toBeDefined();
  return found as string;
};

const expectOutboundDirectives = (csp: string): void => {
  /* `'none'` silently blocks the contact form; `*` is no control at all. */
  expect(
    directive(csp, 'form-action'),
    "form-action must be 'self' for the /contact/send/ post.",
  ).toBe("form-action 'self'");

  /* Drift silently drops analytics; wider sends data /privacy does not name. */
  expect(
    directive(csp, 'connect-src'),
    ANALYTICS_ON
      ? `connect-src must be 'self' plus UMAMI_HOST_URL (${UMAMI_HOST_URL}).`
      : "connect-src must be 'self' alone while analytics is off in src/site.config.ts.",
  ).toBe(
    ANALYTICS_ON
      ? `connect-src 'self' ${UMAMI_HOST_URL}`
      : "connect-src 'self'",
  );

  /* Guards a future http:// URL: upgraded works, blocked is a broken image. */
  expect(
    directive(csp, 'upgrade-insecure-requests'),
    'the CSP is missing upgrade-insecure-requests.',
  ).toBe('upgrade-insecure-requests');
};

test.describe('security headers as declared and served', NODE, () => {
  const policy = usePolicyServer();
  let rules: Rule[];
  /** The `/*` rule: every header but the two asset ones is set there. */
  let headers: Map<string, string>;

  test.beforeAll(() => {
    rules = policy().rules;
    const global = rules.find((rule) => rule.pattern === GLOBAL_PATTERN);
    expect(global, `_headers has no ${GLOBAL_PATTERN} rule.`).toBeDefined();
    headers = global!.headers;
  });

  test('a rule detaches nothing but Cache-Control', () => {
    const detached = rules.flatMap((rule) =>
      [...rule.detached]
        .filter((name) => !DETACHABLE.has(name))
        .map((name) => `${rule.pattern} detaches ${name}`),
    );

    expect(
      detached,
      'a rule detaches a header other than Cache-Control.',
    ).toEqual([]);
  });

  /** An unknown type is served as octet-stream, which `nosniff` makes the browser drop. */
  test('every file type the build emits has a type here', () => {
    const extensions = new Set<string>();

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        // `_headers` has no extension and is never requested by a browser.
        else if (extname(entry.name) !== '')
          extensions.add(extname(entry.name));
      }
    };
    walk(DIST_DIR);

    expect(
      [...extensions].filter((extension) => !(extension in MIME)).sort(),
      'the build emits a file type missing from MIME in scripts/mime-types.mjs.',
    ).toEqual([]);
  });

  test('no header is set by more than one rule', () => {
    const seen = new Map<string, string[]>();

    for (const rule of rules) {
      for (const name of rule.headers.keys()) {
        if (JOINED_ON_PURPOSE.has(name)) continue;
        seen.set(name, [...(seen.get(name) ?? []), rule.pattern]);
      }
    }

    const shared = [...seen.entries()]
      .filter(([, patterns]) => patterns.length > 1)
      .map(([name, patterns]) => `${name} (${patterns.join(' and ')})`);

    expect(
      shared,
      'a header is set by more than one rule, which Cloudflare comma-joins.',
    ).toEqual([]);
  });

  test('every page carries no-transform and no noindex', () => {
    const paths = [...htmlFiles().map(servedPath), '/no-such-page'];
    expect(paths.length, 'the build has no pages').toBeGreaterThan(1);

    for (const path of paths) {
      const served = headersFor(rules, path);
      expect
        .soft(served.get('cache-control'), `${path} lacks ${NO_TRANSFORM}.`)
        .toBe(NO_TRANSFORM);
      expect
        .soft(served.get('x-robots-tag'), `${path} is kept out of search.`)
        .toBeUndefined();
    }
  });

  test('favicons, feeds and the vendored script drop no-transform to be compressed', () => {
    const paths = [
      ...builtFiles(DIST_DIR)
        .filter((file) => COMPRESSIBLE.test(file.split(sep).pop() ?? ''))
        .map(servedPath),
      UMAMI_SCRIPT_PATH,
    ];
    expect(
      paths.some((path) => path.endsWith('rss.xml')) &&
        paths.some((path) => path.startsWith('/favicon.')),
      'the build has no feed or no favicon to check',
    ).toBe(true);

    for (const path of paths) {
      expect
        .soft(
          headersFor(rules, path).get('cache-control') ?? '',
          `${path} keeps no-transform, so it is not compressed.`,
        )
        .not.toMatch(/\bno-transform\b/);
    }

    expect(
      headersFor(rules, UMAMI_SCRIPT_PATH).get('cache-control'),
      'the tracker revalidates on every page view without a short max-age.',
    ).toBe(VENDOR_CACHE_CONTROL);

    expect(
      headersFor(rules, '/_astro/BaseLayout.css').get('cache-control'),
      'a hashed asset should get immutable caching, not no-transform.',
    ).toBe(ASSET_CACHE_CONTROL);
  });

  test("each post's Markdown copy is kept out of search", () => {
    const copies = builtFiles(join(DIST_DIR, 'blog'))
      .filter((file) => file.endsWith('.md'))
      .map(servedPath);
    expect(copies.length, 'the build has no /blog/*.md copy').toBeGreaterThan(
      0,
    );

    for (const path of copies) {
      expect
        .soft(
          headersFor(rules, path).get('x-robots-tag'),
          `${path} is indexable.`,
        )
        .toBe('noindex');
    }
  });

  test('the asset rule caches immutably, and nothing else does', () => {
    /* Immutable on an unhashed path freezes it in browsers for a year. */
    for (const rule of rules) {
      const cacheControl = rule.headers.get('cache-control') ?? '';
      if (!/\bimmutable\b/.test(cacheControl)) continue;

      expect(
        rule.pattern,
        `${rule.pattern} is cached immutably; only ${ASSET_PATTERN} may be.`,
      ).toBe(ASSET_PATTERN);
    }

    const assets = rules.find((rule) => rule.pattern === ASSET_PATTERN);
    expect(
      assets?.headers.get('cache-control'),
      `${ASSET_PATTERN} should be cached immutably.`,
    ).toMatch(/\bimmutable\b/);
  });

  test('the isolation headers are set, and COEP is not', () => {
    expect(
      headers.get('cross-origin-opener-policy'),
      'Cross-Origin-Opener-Policy should be same-origin.',
    ).toBe('same-origin');

    const assets = rules.find((rule) => rule.pattern === ASSET_PATTERN);
    expect(
      assets?.headers.get('cross-origin-resource-policy'),
      `${ASSET_PATTERN} should be CORP same-origin (not ${GLOBAL_PATTERN}: the OG image is embedded off-origin).`,
    ).toBe('same-origin');

    /* COEP only unlocks SharedArrayBuffer, unused here, and breaks cross-origin subresources. */
    for (const rule of rules) {
      expect(
        rule.headers.has('cross-origin-embedder-policy'),
        `${rule.pattern} sets Cross-Origin-Embedder-Policy.`,
      ).toBe(false);
    }
  });

  test('every required header is declared', () => {
    for (const name of REQUIRED_HEADERS) {
      expect(
        headers.get(name),
        `_headers does not declare ${name}`,
      ).toBeTruthy();
    }

    expect(headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('the referrer, framing and feature policies keep their secure values', () => {
    for (const [name, value] of Object.entries(PINNED_HEADERS)) {
      expect(headers.get(name), `${name} was weakened or removed`).toBe(value);
    }

    const allowlists = new Map(
      (headers.get('permissions-policy') ?? '')
        .split(',')
        .map((entry) => entry.trim().split('=') as [string, string]),
    );
    for (const feature of DENIED_FEATURES) {
      expect(
        allowlists.get(feature),
        `Permissions-Policy no longer denies ${feature} to every origin`,
      ).toBe('()');
    }
  });

  /**
   * `preload` puts the host in browser binaries, which takes months to undo.
   * `includeSubDomains` is not asserted; public/_headers explains it.
   */
  test('hsts carries the committed max-age and is not preloaded', () => {
    const hsts = headers.get('strict-transport-security') as string;

    expect(
      hsts,
      'Strict-Transport-Security must not carry `preload`.',
    ).not.toMatch(/\bpreload\b/i);

    const maxAge = hsts.match(/max-age\s*=\s*(\d+)/i);
    expect(maxAge, `no max-age in "${hsts}"`).not.toBeNull();

    expect(
      Number(maxAge?.[1]),
      `public/_headers sets max-age=${maxAge?.[1]}, not the committed ${HSTS_MAX_AGE}.`,
    ).toBe(HSTS_MAX_AGE);
  });

  test('the csp allows no inline or eval escape hatch', () => {
    const csp = headers.get('content-security-policy') as string;

    for (const escape of [
      "'unsafe-inline'",
      "'unsafe-eval'",
      "'unsafe-hashes'",
    ]) {
      expect(csp, `the CSP contains ${escape}.`).not.toContain(escape);
    }

    expect(directive(csp, 'default-src')).toBe("default-src 'self'");
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive(csp, 'base-uri')).toBe("base-uri 'none'");
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");

    expectOutboundDirectives(csp);
  });

  /** Both directions: a stale hash hides what is allowed; a missing one blocks a script. */
  test('the csp allows exactly the inline blocks the build emits', () => {
    const csp = headers.get('content-security-policy') as string;
    const { scripts, styles } = inlineBlocks();

    const check = (name: string, bodies: Set<string>, source: string): void => {
      const expected = [...bodies].map(cspHash).sort();
      const listed = (source.match(/'sha256-[A-Za-z0-9+/=]+'/g) ?? []).sort();

      expect(
        listed,
        `${name} in public/_headers does not match the ${bodies.size} inline block(s) in dist/; use:\n  ${expected.join(' ')}`,
      ).toEqual(expected);
    };

    expect(
      scripts.size,
      'expected inline scripts in the build',
    ).toBeGreaterThan(0);
    check('script-src', scripts, directive(csp, 'script-src'));
    check('style-src', styles, directive(csp, 'style-src'));
  });

  test('a served response actually carries the headers', async ({
    request,
  }) => {
    const response = await request.get(`${policy().origin}/`);

    for (const name of REQUIRED_HEADERS) {
      expect(
        response.headers()[name],
        `${name} is missing from the response`,
      ).toBe(asServed(name, headers.get(name) ?? ''));
    }
  });

  test('the HTML is not cached immutably', async ({ request }) => {
    const response = await request.get(`${policy().origin}/`);
    const cacheControl = response.headers()['cache-control'];

    expect(
      cacheControl ?? '',
      'the HTML must not be cached immutably.',
    ).not.toMatch(/\bimmutable\b/);
  });

  test('a malformed escape is refused, and the server keeps serving', async ({
    request,
  }) => {
    const malformed = await request.get(`${policy().origin}/%E0%A4%A`);
    expect(malformed.status(), 'a malformed escape should get 400').toBe(400);
    expect((await request.get(`${policy().origin}/`)).status()).toBe(200);
  });

  test('the 404 response carries the headers too', async ({ request }) => {
    const response = await request.get(
      `${policy().origin}/no-such-path-${Date.now()}`,
    );

    expect(response.status()).toBe(404);
    expect(response.headers()['content-security-policy']).toBe(
      asServed(
        'content-security-policy',
        headers.get('content-security-policy') ?? '',
      ),
    );
  });
});
