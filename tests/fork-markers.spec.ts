import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { DIST_DIR } from './routes';
import { NODE } from './tags';
import { todoComments } from '../scripts/check-fork.mjs';

/* Build correctness: a fork marker is a note to whoever forks the template, never text a visitor is served. */

const MARKER = 'TODO(fork)';
const TEXT_FILE = /\.(?:html|txt|xml|json|webmanifest|md|js|css|svg)$/;

const builtTextFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return builtTextFiles(full);
    return TEXT_FILE.test(entry.name) ? [full] : [];
  });

test.describe('fork markers', () => {
  test('no built file carries a fork marker', NODE, () => {
    const files = builtTextFiles(DIST_DIR);
    expect(files.length, `${DIST_DIR} has no text file`).toBeGreaterThan(0);
    expect(
      files.filter((file) => readFileSync(file, 'utf8').includes(MARKER)),
      'a fork marker reaches the built site; move it into a comment the build drops.',
    ).toEqual([]);
  });

  test('every TODO comment in a tracked file is a fork marker', NODE, () => {
    expect(
      todoComments()
        .filter((comment) => comment.malformed)
        .map(({ file, line }) => `${file}:${line}`),
      'a TODO comment is not written as "TODO(fork): what to change".',
    ).toEqual([]);
  });
});
