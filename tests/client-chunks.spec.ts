import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { DIST_DIR } from './routes';
import { NODE } from './tags';

/** The browser bundles carry no server-only `process` shim (astro.config.mjs, vite.environments.client). */

const CHUNKS = join(DIST_DIR, '_astro');

/** A global `process` read: `process.x` not preceded by a name character or a dot. */
const GLOBAL_PROCESS = /(?<![\w$.])process\s*\./;

const clientChunks = (): { file: string; source: string }[] =>
  readdirSync(CHUNKS)
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({
      file,
      source: readFileSync(join(CHUNKS, file), 'utf8'),
    }));

test.describe('client chunks', NODE, () => {
  test('none starts with the adapter banner, so an adapter bump cannot bring it back', () => {
    const chunks = clientChunks();
    expect(chunks.length, `${CHUNKS} has no script to check`).toBeGreaterThan(
      0,
    );
    expect(
      chunks
        .filter(({ source }) => source.startsWith('globalThis.process'))
        .map(({ file }) => file),
      'chunks open with the server `process` shim: check the client banner override in astro.config.mjs',
    ).toEqual([]);
  });

  test('none reads a global `process`, which the browser does not have', () => {
    expect(
      clientChunks()
        .filter(({ source }) => GLOBAL_PROCESS.test(source))
        .map(({ file }) => file),
      'chunks read `process.` at runtime and would throw without the shim',
    ).toEqual([]);
  });
});
