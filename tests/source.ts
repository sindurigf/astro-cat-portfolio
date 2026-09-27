import { globSync, readFileSync } from 'node:fs';
import { expect } from '@playwright/test';
import ts from 'typescript';
import {
  cssColorToken as readCssColorToken,
  GLOBAL_CSS,
} from '../src/lib/css-token';
import { SITE_CONFIG } from '../src/site.config';

/** Values read from the repository, not copied, so a stale copy cannot pass. */
const ASTRO_CONFIG = 'astro.config.mjs';
const CONTENT_CONFIG = 'src/content.config.ts';
const WRANGLER_CONFIG = 'wrangler.jsonc';

export { GLOBAL_CSS };

export const STYLESHEETS = 'src/styles/**/*.css';

/** Every stylesheet `GLOBAL_CSS` imports, and itself, as one string. */
export const stylesheetSource = (): string =>
  globSync(STYLESHEETS)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');

/**
 * Same parse astro.config.mjs uses for `__THEME_COLOR__`. Throws on a token
 * defined twice, so a `prefers-color-scheme` override fails the build.
 */
export const cssColorToken = (name: string): string =>
  readCssColorToken(name).toLowerCase();

/**
 * `site.url` from src/site.config.ts, once astro.config.mjs is seen to build
 * with it. Searched from `defineConfig({` at its own indent, so a
 * commented-out line cannot match.
 */
export const configuredSite = (): string => {
  const source = readFileSync(ASTRO_CONFIG, 'utf8');
  const config = source.slice(source.indexOf('defineConfig({'));

  expect(
    /^ {2}site: SITE_CONFIG\.site\.url,$/m.test(config),
    `${ASTRO_CONFIG} does not set \`site\` from src/site.config.ts.`,
  ).toBe(true);

  return SITE_CONFIG.site.url;
};

/** `BLOG_CATEGORIES` from src/content.config.ts, which imports `astro:content`. */
export const blogCategories = (): string[] => {
  const source = readFileSync(CONTENT_CONFIG, 'utf8');
  const list = /BLOG_CATEGORIES = \[([^\]]*)\]/.exec(source)?.[1];

  expect(list, `no BLOG_CATEGORIES found in ${CONTENT_CONFIG}.`).toBeDefined();

  return [...list!.matchAll(/'([a-z-]+)'/g)].map((match) => match[1]!);
};

/** wrangler.jsonc: `JSON.parse` rejects its comments and trailing commas; TypeScript's reader does not. */
export const wranglerConfig = <T>(): T => {
  const { config, error } = ts.parseConfigFileTextToJson(
    WRANGLER_CONFIG,
    readFileSync(WRANGLER_CONFIG, 'utf8'),
  );
  if (error) {
    throw new Error(
      `${WRANGLER_CONFIG} does not parse: ` +
        ts.flattenDiagnosticMessageText(error.messageText, '\n'),
    );
  }
  return config as T;
};

const PNG_SIGNATURE = '89504e470d0a1a0a';
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;

/** A PNG's pixel size from its IHDR; null when the bytes are not a PNG. */
export const pngSize = (
  bytes: Buffer,
): { width: number; height: number } | null =>
  bytes.subarray(0, 8).toString('hex') === PNG_SIGNATURE
    ? {
        width: bytes.readUInt32BE(PNG_WIDTH_OFFSET),
        height: bytes.readUInt32BE(PNG_HEIGHT_OFFSET),
      }
    : null;
