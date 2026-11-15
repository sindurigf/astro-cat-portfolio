import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, test } from './test';
import { fixture, runCheck, writeFiles, type Files } from './check-fixture';
import { NODE } from './tags';

const SCRIPT = 'scripts/check-wording.mjs';
const DOC = 'docs/NOTES.md';

/* One line per WORDING_EXCEPTIONS entry, so none reads as stale. */
const EXCEPTION_LINES: Files = {
  'src/content/blog/sample-post.md': 'Nico Olvia gave her the first camera.\n',
  'src/pages/about.astro': '  description={`${PERSON_NAME} and her cat.`}\n',
  'src/pages/credits.astro': '<a href={PERSONA_SOURCES_PATH}>Her stories</a>\n',
  'tests/about-cats.spec.ts':
    "expect(open, `${NAMES[id]}'s card covers her`).toBe(true);\n",
  'src/lib/feed-excerpt.ts': "  mdash: '—',\n",
};

const repo = (extra: Files = {}): string => {
  const root = fixture({
    [DOC]:
      '# Notes\n\nI moved the build step. Other, either, where, Hermes, theirs.\n',
    ...EXCEPTION_LINES,
    ...extra,
  });
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  return root;
};

const BAD_LINES = [
  { rule: 'the-owner', line: 'The owner merges it.' },
  { rule: 'the-owner', line: 'Wait for the owner’s review.' },
  { rule: 'she-her', line: 'Ask before she merges.' },
  { rule: 'she-her', line: 'It needs her approval.' },
  { rule: 'site-owner', line: 'The site owner decides.' },
  { rule: 'em-dash', line: 'Build first — then check.' },
  { rule: 'em-dash', line: 'Build first &mdash; then check.' },
];

test.describe('check:wording', NODE, () => {
  test('passes first-person text, words that contain "her", and each exception', () => {
    const { status, output } = runCheck(SCRIPT, repo());
    expect(status, output).toBe(0);
  });

  for (const { rule, line } of BAD_LINES) {
    test(`fails ${rule} in "${line}" and names the file and line`, () => {
      const root = repo({ [DOC]: `# Notes\n\n${line}\n` });
      const { status, output } = runCheck(SCRIPT, root);
      expect(status, output).not.toBe(0);
      expect(output).toContain(`${DOC}:3  ${rule}:`);
    });
  }

  test('fails an exception that no longer matches', () => {
    const root = repo({ 'src/lib/feed-excerpt.ts': "  amp: '&',\n" });
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).not.toBe(0);
    expect(output).toContain('no longer matches');
  });

  test('skips a gitignored file', () => {
    const root = repo({
      '.gitignore': 'tmp/\n',
      'tmp/scratch.md': 'The owner said so.\n',
    });
    const { status, output } = runCheck(SCRIPT, root);
    expect(status, output).toBe(0);
  });

  test('--text fails a pull request body with no exception applied', () => {
    const root = repo();
    const body = join(root, 'pull-request.txt');
    writeFiles(root, {
      'pull-request.txt': 'Fix the menu.\n\n![She smiles.](a.png)\n',
    });
    const { status, output } = runCheck(SCRIPT, root, ['--text', body]);
    expect(status, output).not.toBe(0);
    expect(output).toContain('pull-request.txt:3  she-her:');
  });

  test('--text passes a first-person pull request body', () => {
    const root = repo();
    const body = join(root, 'pull-request.txt');
    writeFiles(root, { 'pull-request.txt': 'Fix the menu.\n\nI moved it.\n' });
    const { status, output } = runCheck(SCRIPT, root, ['--text', body]);
    expect(status, output).toBe(0);
  });
});
