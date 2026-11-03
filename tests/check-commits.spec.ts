import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from './test';
import { fixture } from './check-fixture';
import { NODE } from './tags';

const SCRIPT = resolve('scripts/check-commits.sh');

/* No user hooks or signing: the repo's commit-msg hook would strip the trailer under test. */
const GIT_CONFIG = [
  '-c',
  'user.name=Fixture',
  '-c',
  'user.email=fixture@example.invalid',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.hooksPath=/dev/null',
];

const repoWith = (message: string): string => {
  const root = fixture({});
  const git = (...args: string[]) =>
    execFileSync('git', [...GIT_CONFIG, ...args], { cwd: root });
  git('init', '--quiet');
  git('commit', '--quiet', '--allow-empty', '-m', message);
  return root;
};

const check = (root: string) => {
  const run = spawnSync('sh', [SCRIPT, 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (run.error) throw run.error;
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
};

test.describe('check:commits', NODE, () => {
  test('passes a "type: Sentence." subject with no attribution', () => {
    const { status, output } = check(
      repoWith('test: Cover the check scripts.'),
    );
    expect(status, output).toBe(0);
  });

  test('fails a subject that is not "type: Sentence." and names it', () => {
    const subject = 'fix(ci) lower case, no full stop';
    const { status, output } = check(repoWith(subject));
    expect(status, output).not.toBe(0);
    expect(output).toContain(subject);
  });

  test('fails a Co-Authored-By trailer naming Claude', () => {
    const subject = 'test: Cover the check scripts.';
    const { status, output } = check(
      repoWith(`${subject}\n\nCo-Authored-By: Claude <noreply@anthropic.com>`),
    );
    expect(status, output).not.toBe(0);
    expect(output).toContain('AI attribution');
    expect(output).toContain(subject);
  });
});
