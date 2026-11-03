import { symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from './test';
import { fixture, runCheck, type Files } from './check-fixture';
import { TOKEN_EXCEPTIONS } from '../scripts/check-allow-lists.mjs';
import { NODE } from './tags';

const SCRIPT = 'scripts/check-tokens.mjs';
const BAD_FILE = 'src/components/Bad.astro';
const BAD_SOURCE =
  '<p class="p-4">Text</p>\n<style>p { color: #ff0000; }</style>\n';

const TOKENS = [
  '@theme static {',
  '  --color-ink: #101010;',
  '  --text-body: clamp(1rem, 1rem + 1vw, 1.5rem);',
  '}',
  '',
].join('\n');

/* Each exception's text in its file, so none reads as stale. */
const exceptionFiles = (): Files => {
  const files: Record<string, string> = {};
  for (const { file, text } of TOKEN_EXCEPTIONS as {
    file: string;
    text: string;
  }[]) {
    files[file] = `${files[file] ?? ''}const pattern = /${text}/;\n`;
  }
  return files;
};

const tree = (extra: Files = {}): Files => ({
  'src/styles/global.css': TOKENS,
  'src/components/Good.astro': '<p class="p-4 text-ink">Text</p>\n',
  ...exceptionFiles(),
  ...extra,
});

test.describe('check:tokens', NODE, () => {
  test('passes source that uses only tokens', () => {
    const { status, output } = runCheck(SCRIPT, fixture(tree()));
    expect(status, output).toBe(0);
  });

  test('fails a raw hex color outside global.css and names the file', () => {
    const root = fixture(
      tree({
        [BAD_FILE]: BAD_SOURCE,
      }),
    );
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).not.toBe(0);
    expect(output).toContain(`${BAD_FILE}:2`);
    expect(output).toContain('raw hex');
  });

  test('fails a bad fixture when run through a symlink to the script', () => {
    const root = fixture(tree({ [BAD_FILE]: BAD_SOURCE }));
    const link = join(test.info().outputDir, 'check-tokens-link.mjs');
    symlinkSync(resolve(SCRIPT), link);
    const { status, output } = runCheck(link, root);
    expect(status, output).not.toBe(0);
    expect(output).toContain(`${BAD_FILE}:2`);
  });
});
