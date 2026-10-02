/*
 * NOINDEX builds only, in place of @astrojs/sitemap: rewrites the copied
 * _headers so static assets carry noindex too. src/lib/noindex-headers.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { noindexHeaders } from '../src/lib/noindex-headers.ts';

const HEADERS_FILE = '_headers';

export const noindex = () => ({
  name: 'noindex',
  hooks: {
    'astro:build:done': ({ dir, logger }) => {
      const file = join(fileURLToPath(dir), HEADERS_FILE);
      writeFileSync(file, noindexHeaders(readFileSync(file, 'utf8')));
      logger.info(`${HEADERS_FILE}: noindex on every response, no sitemap.`);
    },
  },
});
