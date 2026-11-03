import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from './test';

/** Relative path to file content, written under a fresh fixture root. */
export type Files = Record<string, string | Uint8Array>;

export type CheckResult = { status: number | null; output: string };

const FINGERPRINT_MODULE = pathToFileURL(
  resolve('scripts/build-fingerprint.mjs'),
).href;

export const writeFiles = (root: string, files: Files): void => {
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
};

export const fixture = (files: Files): string => {
  const { outputDir } = test.info();
  mkdirSync(outputDir, { recursive: true });
  const root = mkdtempSync(join(outputDir, 'fixture-'));
  writeFiles(root, files);
  return root;
};

const checkEnv = (root: string): NodeJS.ProcessEnv => ({
  ...process.env,
  CHECK_ROOT: root,
});

/** A fixture with a current dist/ fingerprint, as `npm run build` leaves it. */
export const builtFixture = (files: Files): string => {
  const root = fixture({ '.gitignore': 'dist/\n', ...files });
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  const stamp = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { fingerprint } from '${FINGERPRINT_MODULE}'; process.stdout.write(fingerprint());`,
    ],
    { cwd: root, env: checkEnv(root), encoding: 'utf8' },
  );
  writeFiles(root, { 'dist/.build-fingerprint': stamp });
  return root;
};

/** Runs a check script in plain Node against `root`, as `npm run check` runs it. */
export const runCheck = (
  script: string,
  root: string,
  args: string[] = [],
): CheckResult => {
  const run = spawnSync(process.execPath, [resolve(script), ...args], {
    cwd: root,
    env: checkEnv(root),
    encoding: 'utf8',
  });
  if (run.error) throw run.error;
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
};
