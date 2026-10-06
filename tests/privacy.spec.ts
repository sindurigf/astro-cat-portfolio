import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { builtPages, DIST_DIR, pagesNotLinking } from './routes';
import { configuredSite } from './source';
import { RETENTION_DAYS } from '../src/lib/contact-form';
import { UMAMI_HOST_URL, UMAMI_SCRIPT_PATH } from '../src/lib/analytics';
import { ANALYTICS_ON } from '../src/lib/analytics-site';
import { CONTACT_FORM_ON } from '../src/lib/contact';
import {
  UMAMI_RETENTION_MONTHS,
  WORKER_LOG_RETENTION_DAYS,
} from '../src/lib/platform-facts';
import { NODE } from './tags';

/**
 * Every factual claim on /privacy, checked against the build. Anything that
 * talks to another origin needs a page edit in the same commit. Edge-injected
 * scripts are outside dist/: scripts/check-live.sh covers them after deploy.
 */
const SRC_DIR = 'src';
const PRIVACY_PAGE = '/privacy';

/** The page's `<strong>` labels, lower-cased, without the trailing full stop. */
const CLAIMS = [
  'no cookies',
  'one browser setting',
  'nothing loaded from other websites',
];

// Writes, not mentions: the tracker reads `umami.disabled` from localStorage.
const TRACKER_WRITES = [
  /\.setItem\s*\(/,
  /document\.cookie/,
  /sessionStorage/,
  /indexedDB/,
];

const ownHost = (): string => new URL(configuredSite()).host;

// The one write /privacy discloses: the color choice, read in BaseLayout.astro, written by theme-switch.ts.
const DISCLOSED_STORAGE = {
  files: [
    join('src', 'layouts', 'BaseLayout.astro'),
    join('src', 'scripts', 'theme-switch.ts'),
  ],
  api: 'localStorage',
};

const STORAGE_APIS = [
  'document.cookie',
  'localStorage',
  'sessionStorage',
  'indexedDB',
];

/**
 * Attributes that cause a fetch. `<a href>` is absent: a link sends nothing
 * until followed. Same-origin URLs (canonical, sitemap) are filtered by host
 * below rather than by a `rel` allowlist.
 */
const SUBRESOURCE =
  /<(?:script|link|img|iframe|video|audio|source|embed|object|track)\b[^>]*\b(?:src|href|data|poster)\s*=\s*["']((?:https?:)?\/\/[^"']+)["']/gi;

/*
 * Fetches SUBRESOURCE cannot see: `srcset` candidates and CSS `url()` or
 * `@import`. A protocol-relative `//host` URL is absolute too.
 */
const SRCSET = /\bsrcset\s*=\s*["']([^"']+)["']/gi;
const CSS_URL = /(?:url\(\s*|@import\s+)["']?((?:https?:)?\/\/[^"')\s;]+)/gi;

const absoluteUrls = (text: string, isCss: boolean): string[] => {
  if (isCss) return [...text.matchAll(CSS_URL)].map((m) => m[1]!);
  const candidates = [...text.matchAll(SRCSET)].flatMap((m) =>
    m[1]!
      .split(',')
      .map((candidate) => candidate.trim().split(/\s+/)[0]!)
      .filter((url) => /^(?:https?:)?\/\//.test(url)),
  );
  return [
    ...[...text.matchAll(SUBRESOURCE)].map((m) => m[1]!),
    ...candidates,
    ...[...text.matchAll(CSS_URL)].map((m) => m[1]!),
  ];
};

const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(astro|vue|ts|js|css)$/.test(entry.name)) out.push(full);
  }
  return out;
};

// Comments blanked, so prose naming an API is not mistaken for a use of it.
const withoutComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, (m) => m.replace(/[^\n]/g, ' '));

const privacyBodyText = (): string => {
  const privacy = builtPages().find((page) => page.route === PRIVACY_PAGE)!;
  const html = readFileSync(privacy.file, 'utf8');
  return html
    .slice(html.indexOf('<body'))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
};

/** The text under one `<h2>` of /privacy, up to the next. */
const privacySectionText = (heading: string): string => {
  const privacy = builtPages().find((page) => page.route === PRIVACY_PAGE)!;
  const html = readFileSync(privacy.file, 'utf8');
  const start = html.indexOf(`<h2>${heading}</h2>`);
  expect(start, `/privacy has no "${heading}" section.`).toBeGreaterThan(-1);
  const end = html.indexOf('<h2', start + 1);
  return html
    .slice(start, end === -1 ? undefined : end)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
};

const expectCopiesDisclosed = (text: string): void => {
  expect(
    text,
    "/privacy no longer says each message is emailed to the owner's inbox.",
  ).toMatch(/copy is emailed[^.]*inbox/);

  expect(
    text,
    '/privacy no longer says Worker requests are logged, and for how long.',
  ).toMatch(
    /logged[^.]*Cloudflare account[\s\S]*deleted automatically after \d+ days/,
  );

  expect(
    text.toLowerCase(),
    '/privacy no longer says how to have a stored message deleted.',
  ).toContain('removed');

  expect(
    text,
    "/privacy no longer discloses Cloudflare's Network Error Logging, which " +
      'the live site still sends; src/lib/platform-facts.ts says how to check.',
  ).toMatch(
    /Network Error Logging[^.]*\.[^.]*failures[\s\S]*a\.nel\.cloudflare\.com/,
  );
};

test.describe('the privacy policy is true', NODE, () => {
  test('the page is built and reachable from every page', () => {
    const pages = builtPages();
    const privacy = pages.find((page) => page.route === PRIVACY_PAGE);
    expect(privacy, '/privacy was not built').toBeDefined();

    const missing = pagesNotLinking(PRIVACY_PAGE);

    expect(
      missing,
      'route(s) with no link to /privacy: ' + missing.join(', '),
    ).toEqual([]);
  });

  test('nothing sets a cookie or writes to browser storage', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC_DIR)) {
      const code = withoutComments(readFileSync(file, 'utf8'));
      for (const api of STORAGE_APIS) {
        const disclosed =
          DISCLOSED_STORAGE.files.includes(file) &&
          api === DISCLOSED_STORAGE.api;
        if (code.includes(api) && !disclosed) offenders.push(`${file}: ${api}`);
      }
    }

    const tracker = readFileSync(join('public', UMAMI_SCRIPT_PATH), 'utf8');
    for (const pattern of TRACKER_WRITES) {
      if (pattern.test(tracker)) {
        offenders.push(`public${UMAMI_SCRIPT_PATH}: ${pattern.source}`);
      }
    }

    expect(
      offenders,
      'undisclosed cookie or storage use:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });

  test('nothing is loaded from another origin', () => {
    const offenders: string[] = [];
    const host = ownHost();

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        const isCss = entry.name.endsWith('.css');
        if (!isCss && !entry.name.endsWith('.html')) continue;

        for (const url of absoluteUrls(readFileSync(full, 'utf8'), isCss)) {
          if (new URL(url, 'https://base.invalid').host === host) continue;
          offenders.push(`${full}: ${url}`);
        }
      }
    };
    walk(DIST_DIR);

    expect(
      offenders,
      'the build loads a subresource off-origin:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });

  test('the page still makes the claims this file checks', () => {
    // Labels, not substrings: the explaining sentence can repeat a phrase.
    const privacy = builtPages().find((page) => page.route === PRIVACY_PAGE)!;
    const html = readFileSync(privacy.file, 'utf8');

    // Body only: <meta name="description"> carries claim strings too.
    const body = html.slice(html.indexOf('<body'));
    const labels = [...body.matchAll(/<strong[^>]*>([^<]+)<\/strong>/g)].map(
      (match) => match[1]!.trim().replace(/\.$/, '').toLowerCase(),
    );

    for (const claim of CLAIMS) {
      expect(
        labels,
        `/privacy no longer makes the "${claim}" claim; labels: ${labels.join(', ')}.`,
      ).toContain(claim);
    }
  });

  test('the page says no visits are counted', () => {
    test.skip(ANALYTICS_ON, 'analytics is on in src/site.config.ts');
    const text = privacyBodyText();

    expect(text, '/privacy no longer says it counts no visits.').toContain(
      'It counts no visits.',
    );
    expect(
      text,
      '/privacy still describes visit counting while analytics is off.',
    ).not.toMatch(/Visit Counts|Umami|umami/);
  });

  test('the page discloses the visit counting', () => {
    test.skip(!ANALYTICS_ON, 'analytics is off in src/site.config.ts');
    const text = privacyBodyText();

    const section = text.slice(text.indexOf('Visit Counts'));

    expect(
      text,
      '/privacy no longer has its "Visit Counts" section.',
    ).toContain('Visit Counts');

    expect(
      section,
      `/privacy no longer names ${new URL(UMAMI_HOST_URL).host}.`,
    ).toContain(new URL(UMAMI_HOST_URL).host);

    expect(
      section,
      '/privacy no longer says Umami stores the counts in the European Union.',
    ).toContain('European Union');

    expect(
      section,
      `/privacy no longer states Umami's ${UMAMI_RETENTION_MONTHS}-month retention.`,
    ).toContain(`keeps it for ${UMAMI_RETENTION_MONTHS} months`);

    expect(
      section,
      '/privacy no longer says link and button clicks are counted.',
    ).toMatch(/click a link or a button/);

    expect(
      section,
      '/privacy no longer says Do Not Track stops sending.',
    ).toContain('Do Not Track');
  });

  test('the page discloses Worker logs and traces and how long they are kept', () => {
    const text = privacyBodyText();

    expect(text, '/privacy no longer discloses Worker traces.').toContain(
      'trace',
    );
    expect(
      text,
      `/privacy no longer states the ${WORKER_LOG_RETENTION_DAYS}-day log and trace retention.`,
    ).toContain(
      `Logs and traces are deleted automatically after ${WORKER_LOG_RETENTION_DAYS} days`,
    );
  });

  test('the page mentions no contact form when there is none', () => {
    test.skip(CONTACT_FORM_ON, 'contact.form is on in src/site.config.ts');
    expect(
      privacyBodyText(),
      '/privacy describes a contact form the site does not have.',
    ).not.toContain('contact form');
  });

  test('the page discloses what the contact form stores', () => {
    test.skip(!CONTACT_FORM_ON, 'contact.form is none in src/site.config.ts');
    const text = privacyBodyText();

    expect(text, '/privacy no longer names the contact form.').toContain(
      'contact form',
    );

    expect(
      text,
      `/privacy no longer states the ${RETENTION_DAYS}-day message retention.`,
    ).toContain(`${RETENTION_DAYS} days`);

    // Fixed: D1 cannot change a database's EU jurisdiction after creation.
    expect(
      privacySectionText('The Contact Form'),
      '/privacy no longer says stored messages are kept in the EU.',
    ).toContain('European Union');

    expectCopiesDisclosed(text);
  });
});
