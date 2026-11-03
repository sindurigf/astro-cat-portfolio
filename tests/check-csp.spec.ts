import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { builtFixture, runCheck } from './check-fixture';
import { NODE } from './tags';

const SCRIPT = 'scripts/check-csp.mjs';
const HEADERS = 'public/_headers';

const INLINE_SCRIPT = 'document.documentElement.dataset.js = "";';
const INLINE_STYLE = 'p{margin:0}';

const hash = (body: string): string =>
  `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;

const headers = (scriptHashes: string[]): string =>
  [
    '/*',
    `  Content-Security-Policy: default-src 'self'; script-src 'self'${scriptHashes.map((h) => ` ${h}`).join('')}; style-src 'self' ${hash(INLINE_STYLE)}; object-src 'none'`,
    '',
  ].join('\n');

const built = (headerText: string): string =>
  builtFixture({
    'dist/client/index.html': `<!doctype html><html><head><style>${INLINE_STYLE}</style><script>${INLINE_SCRIPT}</script></head><body></body></html>`,
    [HEADERS]: headerText,
  });

test.describe('check:csp', NODE, () => {
  test('passes when _headers hashes every inline block the build emits', () => {
    const { status, output } = runCheck(
      SCRIPT,
      built(headers([hash(INLINE_SCRIPT)])),
    );
    expect(status, output).toBe(0);
  });

  test('fails an inline script whose hash is not in _headers and names the file and hash', () => {
    const { status, output } = runCheck(SCRIPT, built(headers([])));
    expect(status, output).not.toBe(0);
    expect(output).toContain(HEADERS);
    expect(output).toContain(hash(INLINE_SCRIPT));
  });

  test('--write puts the missing hash in _headers', () => {
    const root = built(headers([]));
    const { status, output } = runCheck(SCRIPT, root, ['--write']);
    expect(status, output).toBe(0);
    expect(readFileSync(join(root, HEADERS), 'utf8')).toContain(
      hash(INLINE_SCRIPT),
    );
  });
});
