import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { DIST_DIR } from './routes';
import { NODE } from './tags';
import { todoCommentsIn } from '../scripts/check-fork.mjs';

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

  for (const [name, body] of [
    ['a code sample', '```ts\n// TODO: handle errors\n```'],
    ['a shell sample', '```sh\n# TODO\n```'],
    ['a heading', '# TODO'],
  ] as const) {
    test(`a post body with a TODO in ${name} is the writer's own`, NODE, () => {
      const post = `---\n# TODO(fork): replace this post.\ntitle: 'A'\n---\n\n${body}\n`;
      expect(todoCommentsIn('src/content/blog/a.md', post)).toEqual([
        {
          file: 'src/content/blog/a.md',
          line: 2,
          text: '# TODO(fork): replace this post.',
          malformed: false,
        },
      ]);
    });
  }

  test(
    'a TODO comment in code that is not a fork marker is malformed',
    NODE,
    () => {
      expect(todoCommentsIn('src/lib/a.ts', '// TODO: later\n')).toEqual([
        {
          file: 'src/lib/a.ts',
          line: 1,
          text: '// TODO: later',
          malformed: true,
        },
      ]);
    },
  );
});
