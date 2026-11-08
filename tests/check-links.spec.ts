import { execFileSync } from 'node:child_process';
import { expect, test } from './test';
import { fixture, runCheck, type Files } from './check-fixture';
import { NODE } from './tags';

/** Build correctness: `npm run check:links` fails on a broken link, and the failure names file and line. */

const SCRIPT = 'scripts/check-links.mjs';

const repository = (files: Files): string => {
  const root = fixture({ '.gitignore': 'private/\n', ...files });
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  return root;
};

const DOC = '# Guide\n\n## Setup\n\nText.\n';

test.describe('check:links', NODE, () => {
  test('passes a link to an existing file and heading', () => {
    const { status, output } = runCheck(
      SCRIPT,
      repository({
        'README.md': '[guide](docs/guide.md)\n\n[setup](docs/guide.md#setup)\n',
        'docs/guide.md': DOC,
      }),
    );
    expect(status, output).toBe(0);
  });

  test('fails a link to a missing path and names file and line', () => {
    const { status, output } = runCheck(
      SCRIPT,
      repository({ 'README.md': 'Intro.\n\n[gone](docs/missing.md)\n' }),
    );
    expect(status, output).not.toBe(0);
    expect(output).toContain('README.md:3  docs/missing.md');
  });

  test('fails a link to a missing heading and names file and line', () => {
    const { status, output } = runCheck(
      SCRIPT,
      repository({
        'README.md': 'Intro.\n\n[x](docs/guide.md#nowhere)\n',
        'docs/guide.md': DOC,
      }),
    );
    expect(status, output).not.toBe(0);
    expect(output).toContain('README.md:3  docs/guide.md#nowhere');
    expect(output).toContain('no heading #nowhere');
  });

  test('fails a link to a gitignored path that exists locally', () => {
    const { status, output } = runCheck(
      SCRIPT,
      repository({
        'README.md': 'Intro.\n\n[notes](private/notes.md)\n',
        'private/notes.md': DOC,
      }),
    );
    expect(status, output).not.toBe(0);
    expect(output).toContain('README.md:3  private/notes.md');
    expect(output).toContain('gitignored');
  });

  test('fails a code span naming a gitignored path', () => {
    const { status, output } = runCheck(
      SCRIPT,
      repository({
        'README.md': 'Intro.\n\nSee `private/notes.md`.\n',
        'private/notes.md': DOC,
      }),
    );
    expect(status, output).not.toBe(0);
    expect(output).toContain('README.md:3  private/notes.md');
  });
});
