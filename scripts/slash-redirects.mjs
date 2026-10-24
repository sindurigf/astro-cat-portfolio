/*
 * Appends `/path /path/ 301` per built page to dist/client/_redirects, which
 * Workers applies before `html_handling` and its 307. No splat: files stay put.
 */
import { appendFileSync, globSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REDIRECTS = '_redirects';
const PAGE = 'index.html';
const STATUS = 301;
/* https://developers.cloudflare.com/workers/static-assets/redirects/ */
const MAX_STATIC_REDIRECTS = 2000;

const isRule = (line) =>
  line.trim() !== '' && !line.trimStart().startsWith('#');

/** `about/index.html` becomes `/about /about/ 301`; the home page has no unslashed form. */
export const slashRedirectLines = (pages) =>
  pages
    .map((page) => page.split(sep).join('/'))
    .filter((page) => page !== PAGE)
    .map((page) => `/${page.slice(0, -`/${PAGE}`.length)}`)
    .sort()
    .map((path) => `${path} ${path}/ ${STATUS}`);

export const slashRedirects = () => ({
  name: 'slash-redirects',
  hooks: {
    'astro:build:done': ({ dir, logger }) => {
      const root = fileURLToPath(dir);
      const file = join(root, REDIRECTS);
      const lines = slashRedirectLines(globSync(`**/${PAGE}`, { cwd: root }));
      const rules = readFileSync(file, 'utf8').split('\n').filter(isRule);
      if (rules.length + lines.length > MAX_STATIC_REDIRECTS) {
        throw new Error(
          `slash-redirects: ${rules.length + lines.length} redirects, over Workers' ${MAX_STATIC_REDIRECTS}.`,
        );
      }
      appendFileSync(
        file,
        `\n# Unslashed page paths, from scripts/slash-redirects.mjs.\n${lines.join('\n')}\n`,
      );
      logger.info(`Appended ${lines.length} slash redirects to ${REDIRECTS}.`);
    },
  },
});
