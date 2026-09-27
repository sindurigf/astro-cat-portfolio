import { readFileSync } from 'node:fs';
import { expect, test } from './test';
import { builtPages, ROUTES } from './routes';
import { SITE_NAME } from '../src/lib/site';
import { PERSON_NAME } from '../src/lib/profiles';
import { NODE } from './tags';

/**
 * SC 2.4.2 Page Titled: axe checks only presence, not that titles are distinct.
 * The homepage is exempt from the separator rule; casing is not asserted.
 */
const SITE = SITE_NAME;

// Safe to match directly: tests/seo.spec.ts keeps comments out of the build.
const titleOf = (html: string): string | null => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : null;
};

const builtTitles = (): Map<string, string | null> => {
  const pages = builtPages();
  return new Map(
    pages.map((page) => [page.route, titleOf(readFileSync(page.file, 'utf8'))]),
  );
};

test.describe('every page says which page it is', NODE, () => {
  test('every route has a non-empty title', () => {
    const titles = builtTitles();
    const missing = ROUTES.filter((route) => {
      const title = titles.get(route);
      return !title || title.length === 0;
    });
    expect(
      missing,
      `route(s) built with no <title> or an empty one: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  test('no two routes share a title', () => {
    const titles = builtTitles();
    const byTitle = new Map<string, string[]>();
    for (const [route, title] of titles) {
      if (title === null) continue;
      byTitle.set(title, [...(byTitle.get(title) ?? []), route]);
    }

    const shared = [...byTitle.entries()].filter(
      ([, routes]) => routes.length > 1,
    );
    expect(
      shared,
      `title(s) used by more than one route:\n` +
        shared
          .map(
            ([title, routes]) =>
              `  ${JSON.stringify(title)}: ${routes.join(', ')}`,
          )
          .join('\n'),
    ).toEqual([]);
  });

  test('every route names itself and the site', () => {
    const titles = builtTitles();

    for (const route of ROUTES) {
      const title = titles.get(route);
      expect(title, `${route} was not found in the build`).toBeTruthy();

      if (route === '/') {
        expect
          .soft(title, `the site root title does not name ${PERSON_NAME}`)
          .toContain(PERSON_NAME);
        continue;
      }

      expect
        .soft(
          title,
          `${route} should be titled "<page> | ${SITE}", got ${JSON.stringify(title)}.`,
        )
        .toMatch(new RegExp(`^.+ \\| ${SITE.replace('.', '\\.')}$`));

      const named = title!.slice(0, title!.lastIndexOf(` | ${SITE}`)).trim();
      expect
        .soft(
          named.length,
          `${route} has an empty page part before the separator`,
        )
        .toBeGreaterThan(0);
      expect
        .soft(named, `${route} names the site twice and the page not at all`)
        .not.toBe(SITE);
    }
  });
});
