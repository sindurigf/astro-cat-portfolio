import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { builtHtml, DIST_DIR } from './routes';
import { NODE } from './tags';

/* Rendered by the Worker on request, so no file in the build stands for them. */
const ON_DEMAND = new Set(['/contact/send/']);

const REDIRECT_SOURCES = new Set(
  readFileSync('public/_redirects', 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.split(/\s+/)[0]!),
);

/* The file a same-origin path is served from, or null when none is. */
const fileFor = (path: string): string | null => {
  const candidates = path.endsWith('/')
    ? [join(DIST_DIR, path, 'index.html')]
    : [join(DIST_DIR, path), join(DIST_DIR, path, 'index.html')];
  return candidates.find((file) => existsSync(file)) ?? null;
};

/* Every same-origin URL a page links to or loads, from href, src and srcset. */
const urlsIn = (html: string): string[] => [
  ...[...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]!),
  ...[...html.matchAll(/\ssrcset="([^"]+)"/g)].flatMap((m) =>
    m[1]!.split(',').map((candidate) => candidate.trim().split(/\s+/)[0]!),
  ),
];

const idsIn = (html: string): Set<string> =>
  new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!));

test(
  'every internal link, source and fragment in the build resolves',
  NODE,
  () => {
    const pages = builtHtml();
    expect(pages.size, 'no built pages').toBeGreaterThan(0);

    const broken: string[] = [];
    let checked = 0;
    for (const [route, html] of pages) {
      for (const raw of urlsIn(html)) {
        const url = raw.replaceAll('&amp;', '&');
        if (!url.startsWith('/') && !url.startsWith('#')) continue;
        if (url.startsWith('//')) continue;
        checked += 1;

        const [pathAndQuery, fragment] = url.split('#') as [string, string?];
        const path = pathAndQuery.split('?')[0]!;
        const targetHtml =
          path === ''
            ? html
            : (pages.get(path.replace(/\/$/, '') || '/') ?? null);

        if (
          path !== '' &&
          !ON_DEMAND.has(path) &&
          !REDIRECT_SOURCES.has(path)
        ) {
          if (fileFor(decodeURIComponent(path)) === null) {
            broken.push(`${route}: ${url} has no file in the build`);
            continue;
          }
        }
        if (
          fragment &&
          targetHtml !== null &&
          !idsIn(targetHtml).has(fragment)
        ) {
          broken.push(`${route}: ${url} names no element with that id`);
        }
      }
    }
    expect(checked, 'no internal URL was found to check').toBeGreaterThan(0);
    expect(broken).toEqual([]);
  },
);
