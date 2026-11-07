import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './test';
import { fixture } from './check-fixture';
import { NODE } from './tags';

/** Build correctness: CI shards cover `playwright test --list` exactly once, so a suite total can match --list. */

const SHARD_SCRIPT = 'scripts/shard-tests.mjs';
const SHARDS = 3;
const LIST_TIMEOUT_MS = 180_000;
const TOTAL_LINE = /^Total: (\d+) tests? in \d+ files?$/m;

const run = (args: string[]): string =>
  execFileSync(process.execPath, args, {
    encoding: 'utf8',
    env: { ...process.env, CI: '' },
  });

const listedTotal = (): number => {
  const out = execFileSync(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', '--list'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  return Number(TOTAL_LINE.exec(out)?.[1]);
};

test.describe('shard-tests', NODE, () => {
  test.setTimeout(LIST_TIMEOUT_MS * 2);

  test('deals every listed test to exactly one shard', () => {
    const dir = fixture({});
    const lines = Array.from({ length: SHARDS }, (_, index) => {
      const out = join(dir, `shard-${index + 1}.txt`);
      run([SHARD_SCRIPT, String(index + 1), String(SHARDS), out]);
      return readFileSync(out, 'utf8').split('\n').filter(Boolean);
    });
    const dealt = lines.flat();

    expect(dealt.length, 'a test is lost or dealt twice').toBe(listedTotal());
    expect(new Set(dealt).size, 'a test is in two shards').toBe(dealt.length);
    for (const shard of lines) {
      expect(shard.length, 'a shard is empty').toBeGreaterThan(0);
    }
  });

  test('rejects a shard outside 1 to total', () => {
    const dir = fixture({});
    expect(() =>
      execFileSync(
        process.execPath,
        [SHARD_SCRIPT, '4', String(SHARDS), join(dir, 'x.txt')],
        { stdio: 'pipe' },
      ),
    ).toThrow(/Usage: node scripts\/shard-tests\.mjs/);
  });
});
