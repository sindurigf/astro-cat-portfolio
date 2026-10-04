/*
 * NOINDEX builds only, in place of @astrojs/sitemap: rewrites the copied
 * _headers so static assets carry noindex too, and drops the sitemap redirect.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { noindexHeaders } from '../src/lib/noindex-headers.ts';
import { noindexRedirects } from '../src/lib/noindex-redirects.ts';

const REWRITES = [
  ['_headers', noindexHeaders, 'noindex on every response, no sitemap.'],
  ['_redirects', noindexRedirects, 'no redirect to the sitemap.'],
];

export const noindex = () => ({
  name: 'noindex',
  hooks: {
    'astro:build:done': ({ dir, logger }) => {
      for (const [name, rewrite, summary] of REWRITES) {
        const file = join(fileURLToPath(dir), name);
        writeFileSync(file, rewrite(readFileSync(file, 'utf8')));
        logger.info(`${name}: ${summary}`);
      }
    },
  },
});
