import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { expect, test } from './test';
import { fixture, type CheckResult } from './check-fixture';
import { NODE } from './tags';

/** Accessibility and build correctness: check:pdf fails a PDF/UA failure and a run that could not validate. */

const SCRIPT = resolve('scripts/check-pdf.mjs');
const PDF = 'public/doc.pdf';
const EXIT_FAILED = 1;
const EXIT_UNUSABLE = 2;

const report = (validationResult: unknown): string =>
  JSON.stringify({ report: { jobs: [{ validationResult }] } });

const COMPLIANT = report([{ compliant: true, details: { ruleSummaries: [] } }]);
const FAILING_RULE = {
  clause: '7.1',
  testNumber: 3,
  failedChecks: 4,
  description: 'Content is not tagged',
};

/** A `docker` alone on PATH: it answers `--version` and prints `stdout` for the run, using only shell builtins. */
const withDocker = (stdout: string): string => {
  const bin = join(test.info().outputDir, `bin-${Math.random()}`);
  mkdirSync(bin, { recursive: true });
  const docker = join(bin, 'docker');
  writeFileSync(
    docker,
    `#!/bin/sh\n[ "$1" = "--version" ] && exit 0\nprintf '%s' '${stdout}'\n`,
  );
  chmodSync(docker, 0o755);
  return bin;
};

const run = (root: string, path: string, args: string[] = []): CheckResult => {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: root,
    env: { ...process.env, PATH: path },
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

const pdfRoot = () => fixture({ [PDF]: '%PDF-1.7\n' });

test.describe('check:pdf', NODE, () => {
  test('passes a PDF that veraPDF reports as conforming', () => {
    const { status, output } = run(pdfRoot(), withDocker(COMPLIANT));
    expect(status, output).toBe(0);
    expect(output).toContain(`PASS ${PDF}`);
  });

  test('fails a non-conforming PDF and names the rule', () => {
    const failing = report([
      { compliant: false, details: { ruleSummaries: [FAILING_RULE] } },
    ]);
    const { status, output } = run(pdfRoot(), withDocker(failing));
    expect(status, output).toBe(EXIT_FAILED);
    expect(output).toContain('7.1 test 3, 4x');
  });

  test('fails a non-conforming PDF whose report names no rule', () => {
    const failing = report([{ compliant: false, details: {} }]);
    const { status, output } = run(pdfRoot(), withDocker(failing));
    expect(status, output).toBe(EXIT_FAILED);
  });

  test('cannot run when veraPDF writes no report', () => {
    const { status, output } = run(pdfRoot(), withDocker(''));
    expect(status, output).toBe(EXIT_UNUSABLE);
    expect(output).toContain('veraPDF wrote no report');
  });

  test('cannot run when veraPDF cannot read the file as a PDF', () => {
    const { status, output } = run(pdfRoot(), withDocker(report([])));
    expect(status, output).toBe(EXIT_UNUSABLE);
    expect(output).toContain('could not be read as a PDF');
  });

  test('cannot run without Docker', () => {
    const { status, output } = run(pdfRoot(), join(pdfRoot(), 'empty'));
    expect(status, output).toBe(EXIT_UNUSABLE);
    expect(output).toContain('needs Docker');
  });

  test('cannot run when public/ holds no PDF', () => {
    const root = fixture({ 'public/readme.txt': 'x' });
    const { status, output } = run(root, withDocker(COMPLIANT));
    expect(status, output).toBe(EXIT_UNUSABLE);
    expect(output).toContain('No PDF found');
  });

  test('refuses a path outside the repository', () => {
    const { status, output } = run(pdfRoot(), withDocker(COMPLIANT), [
      '/etc/hostname',
    ]);
    expect(status, output).toBe(EXIT_UNUSABLE);
    expect(output).toContain('outside the repository');
  });
});
