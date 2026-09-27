import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { builtHtml, DIST_DIR, ROUTES } from './routes';
import {
  cssColorToken,
  GLOBAL_CSS,
  STYLESHEETS,
  stylesheetSource,
} from './source';
import { NODE } from './tags';
import { metaContent } from './html';

/**
 * `color-scheme` and `theme-color`, which no screenshot sees. dist/ is read in
 * each test body: specs are collected before `webServer` builds.
 */

const forEachBuiltRoute = (
  pages: Map<string, string>,
  check: (route: string, html: string) => void,
): void => {
  for (const route of ROUTES) {
    const html = pages.get(route);
    expect(html, `${route} was not found in the build`).toBeTruthy();
    check(route, html!);
  }
};

const expectOneFontPreload = (route: string, html: string): void => {
  const preloads = [
    ...html.matchAll(/<link[^>]*rel=["']preload["'][^>]*>/gi),
  ].map((match) => match[0]);

  const fonts = preloads.filter((tag) => /as=["']font["']/i.test(tag));

  /* Only the latin subset ships: nothing imports the package's CSS. */
  expect
    .soft(fonts.length, `${route} preloads ${fonts.length} fonts, not one.`)
    .toBe(1);

  if (fonts.length !== 1) return;

  const href = /href=["']([^"']+)["']/i.exec(fonts[0]!)?.[1];
  expect.soft(href, `${route} has a font preload with no href`).toBeTruthy();

  if (href) {
    expect
      .soft(
        existsSync(join(DIST_DIR, href.replace(/^\//, ''))),
        `${route} preloads ${href}, which the build did not emit.`,
      )
      .toBe(true);
  }

  expect
    .soft(
      /\bcrossorigin\b/i.test(fonts[0]!),
      `${route} preloads a font without \`crossorigin\`, so it is fetched twice.`,
    )
    .toBe(true);
};

test.describe('the font the first paint needs is preloaded', NODE, () => {
  /*
   * A dead href is a silent 404 (hence the `?url` import); a preload without
   * `crossorigin` is a second, non-CORS request for the same file.
   */
  test('every route preloads exactly one font, correctly', () => {
    forEachBuiltRoute(builtHtml(), expectOneFontPreload);
  });
});

test.describe('the document head declares the colour scheme', NODE, () => {
  test('the stylesheet declares the scheme too', () => {
    /* The meta covers first paint before the stylesheet loads; each is asserted alone. */
    const css = stylesheetSource();

    expect(
      css,
      `${STYLESHEETS} should declare \`color-scheme: dark\` on html.`,
    ).toMatch(/color-scheme:\s*dark\s*;/);

    /* The root is dark in both modes; light mode sets `light` on <main> only. */
    expect(
      css,
      `${STYLESHEETS} should not declare both colour schemes in one declaration.`,
    ).not.toMatch(
      /color-scheme:[^;]*\bdark\b[^;]*\blight\b|color-scheme:[^;]*\blight\b[^;]*\bdark\b/,
    );
  });

  // `expect.soft` names every failing route in one run.
  test('every route declares the dark colour scheme', () => {
    forEachBuiltRoute(builtHtml(), (route, html) => {
      expect
        .soft(
          metaContent(html, 'color-scheme'),
          `${route} should carry <meta name="color-scheme" content="dark">.`,
        )
        .toBe('dark');
    });
  });

  test('every route tints the browser chrome with the background token', () => {
    const pages = builtHtml();
    const background = cssColorToken('--color-background');

    forEachBuiltRoute(pages, (route, html) => {
      const themeColor = metaContent(html, 'theme-color');
      expect
        .soft(themeColor, `${route} should carry <meta name="theme-color">.`)
        .not.toBeNull();

      expect
        .soft(
          themeColor?.toLowerCase(),
          `${route} theme-color is not --color-background from ${GLOBAL_CSS}.`,
        )
        .toBe(background);
    });
  });
});
