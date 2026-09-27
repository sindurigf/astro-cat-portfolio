#!/usr/bin/env node
/*
 * Validates every PDF under public/ against PDF/UA-1 with veraPDF in Docker,
 * read-only and offline. The image is pinned: new rules change the answer.
 * A pass is the machine-checkable part only; docs/MANUAL_TESTING.md the rest.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, posix } from 'node:path';

const IMAGE =
  'verapdf/cli:v1.30.2@sha256:d5ee329657cf9bc4b2400392dd54c7d0a0ce9980ff6fa2da5590eebeec007cdb';
const FLAVOUR = 'ua1';
const PDF_DIR = 'public';
const MOUNT = '/repo';
const MAX_REPORT_BYTES = 64 * 1024 * 1024;
const EXIT_FAILED = 1;
const EXIT_UNUSABLE = 2;

const STATEMENT = 'ACCESSIBILITY.md';
const KNOWN_GAPS = '## 7. Known gaps';

/*
 * Excused only while the file's SHA-256 matches, it still fails, and
 * ACCESSIBILITY.md's Known gaps still names it. A hash, not an expiry date.
 */
const EXPECTED_FAILURES = [];

const findPdfs = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? findPdfs(join(dir, entry.name))
        : entry.name.endsWith('.pdf')
          ? [join(dir, entry.name)]
          : [],
    )
    .sort();

const requireDocker = () => {
  const docker = spawnSync('docker', ['--version'], { stdio: 'ignore' });
  if (docker.error || docker.status !== 0) {
    fail('check:pdf needs Docker; see docs/DEVELOPMENT.md > Published PDFs.');
  }
};

const fail = (message) => {
  console.error(message);
  process.exit(EXIT_UNUSABLE);
};

/* Paths outside the mounted repository are refused, not skipped. */
const containerPath = (pdfPath) => {
  const inRepo = relative(process.cwd(), resolve(pdfPath));
  if (inRepo.startsWith('..') || inRepo === '') {
    fail(`${pdfPath} is outside the repository, so it cannot be validated.`);
  }
  if (!existsSync(pdfPath)) fail(`${pdfPath} does not exist.`);
  return posix.join(MOUNT, inRepo.split(/[\\/]/).join(posix.sep));
};

const runVeraPdf = (pdfPath) => {
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--network',
      'none',
      '-v',
      `${process.cwd()}:${MOUNT}:ro`,
      IMAGE,
      '--flavour',
      FLAVOUR,
      '--format',
      'json',
      containerPath(pdfPath),
    ],
    { encoding: 'utf8', maxBuffer: MAX_REPORT_BYTES },
  );

  if (result.error) fail(`${pdfPath}: ${result.error.message}`);
  if (!result.stdout) {
    fail(`${pdfPath}: veraPDF wrote no report.\n${result.stderr ?? ''}`);
  }
  return result;
};

/* veraPDF exits 0 either way: the verdict comes from the report. */
const validate = (pdfPath) => {
  const { stdout, stderr } = runVeraPdf(pdfPath);

  let jobs;
  try {
    jobs = JSON.parse(stdout).report?.jobs ?? [];
  } catch (error) {
    fail(`${pdfPath}: veraPDF's report did not parse. ${error.message}`);
  }

  const job = jobs[0];
  if (!job) fail(`${pdfPath}: veraPDF returned no result for it.`);
  if (job.taskResult?.exceptionMessage) {
    fail(`${pdfPath}: ${job.taskResult.exceptionMessage}`);
  }

  const result = [].concat(job.validationResult ?? [])[0];
  if (!result) fail(`${pdfPath} could not be read as a PDF.`);

  const rules = (result.details?.ruleSummaries ?? [])
    .map((rule) => ({
      clause: rule.clause,
      test: rule.testNumber,
      failed: rule.failedChecks ?? 0,
      description: (rule.description ?? '').replace(/\s+/g, ' '),
    }))
    .sort((a, b) => b.failed - a.failed);

  return {
    compliant: result.compliant === true,
    rules,
    warnings: group(stderr),
  };
};

/*
 * stderr warnings (e.g. `Nested MCID`) are in no rule summary. Grouped with
 * object numbers dropped, so one defect across many objects is one line.
 */
const group = (stderr) => {
  const counts = new Map();
  for (const line of (stderr ?? '').split('\n')) {
    const warning = line.match(/^WARNING:\s*(.+)$/)?.[1];
    if (!warning) continue;
    const shape = warning
      .replace(/\(object \d+ \d+ obj\)/g, '(object)')
      .replace(/\d+/g, 'N');
    counts.set(shape, (counts.get(shape) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
};

const repoPath = (pdfPath) =>
  relative(process.cwd(), resolve(pdfPath)).split(/[\\/]/).join(posix.sep);

const sha256 = (pdfPath) =>
  createHash('sha256').update(readFileSync(pdfPath)).digest('hex');

/* Empty when the section or item is gone. */
const gapText = (number) => {
  const statement = readFileSync(STATEMENT, 'utf8');
  const start = statement.indexOf(`\n${KNOWN_GAPS}\n`);
  if (start === -1) return '';
  const lines = statement
    .slice(start + 1)
    .split('\n')
    .slice(1);
  const first = lines.findIndex((line) => line.startsWith(`${number}. `));
  if (first === -1) return '';
  const rest = lines.slice(first + 1);
  const end = rest.findIndex((line) => /^(\d+\. |#)/.test(line));
  return [lines[first], ...(end === -1 ? rest : rest.slice(0, end))].join('\n');
};

const where = (entry) => `${STATEMENT} section 7, gap ${entry.gap}`;

const staleness = (pdfPath, entry, { compliant }) => {
  const reasons = [];
  const actual = sha256(pdfPath);
  if (actual !== entry.sha256) {
    reasons.push(
      `The file was replaced: its SHA-256 is ${actual}, and the entry pins ` +
        `${entry.sha256}. Judge the new file on its own: if it passes, delete ` +
        `the entry; if it fails, check ${where(entry)} still describes it, ` +
        `then update sha256 and recorded in EXPECTED_FAILURES.`,
    );
  }
  if (compliant) {
    reasons.push(
      `It now passes, so the entry is stale. Delete it from ` +
        `EXPECTED_FAILURES in scripts/check-pdf.mjs, and update ` +
        `${where(entry)}, which still says it fails.`,
    );
  }
  if (!gapText(entry.gap).includes(entry.path)) {
    reasons.push(
      `${where(entry)} no longer names ${entry.path}, so nothing public ` +
        `admits this failure. Restore the statement, or point gap at the ` +
        `item that now names the file.`,
    );
  }
  return reasons;
};

const judgeExpected = (pdfPath, entry, result) => {
  const failed = result.rules.reduce((total, rule) => total + rule.failed, 0);
  const reasons = staleness(pdfPath, entry, result);
  if (reasons.length === 0) {
    console.log(
      `KNOWN FAILURE ${pdfPath}: ${failed} failed checks, expected. ` +
        `${where(entry)} records it: ${entry.reason}. Pinned ${entry.recorded}.`,
    );
    return 0;
  }
  console.log(`FAIL ${pdfPath}: its expected-failure entry no longer applies.`);
  for (const reason of reasons) console.log(`  ${reason}`);
  report(pdfPath, result, { quiet: true });
  return reasons.length;
};

const report = (pdfPath, { compliant, rules, warnings }, { quiet } = {}) => {
  const failed = rules.reduce((total, rule) => total + rule.failed, 0);

  if (!quiet) {
    console.log(
      compliant
        ? `PASS ${pdfPath}`
        : `FAIL ${pdfPath}: ${failed} failed checks across ${rules.length} rules`,
    );
  }
  for (const rule of rules) {
    console.log(`  ${rule.clause} test ${rule.test}, ${rule.failed}x`);
    console.log(`    ${rule.description}`);
  }
  for (const [warning, count] of warnings) {
    console.log(`  warning, ${count}x: ${warning}`);
  }

  /* veraPDF's verdict decides: a failure with no rule summary still fails. */
  return compliant ? 0 : Math.max(failed, 1);
};

requireDocker();

const targets = process.argv.slice(2);
const pdfs = targets.length > 0 ? [...targets].sort() : findPdfs(PDF_DIR);
if (pdfs.length === 0) fail(`No PDF found under ${PDF_DIR}/.`);

console.log(
  `Validating ${pdfs.length} PDF${pdfs.length === 1 ? '' : 's'} against PDF/UA-1 with ${IMAGE}.`,
);

let failures = 0;
let known = 0;
for (const pdf of pdfs) {
  console.log(`\n${pdf}`);
  const entry = EXPECTED_FAILURES.find((e) => e.path === repoPath(pdf));
  const result = validate(pdf);
  if (!entry) {
    failures += report(pdf, result);
    continue;
  }
  const stale = judgeExpected(pdf, entry, result);
  failures += stale;
  if (stale === 0) known += 1;
}

/* Only a full run can tell an entry's file is gone. */
if (targets.length === 0) {
  for (const entry of EXPECTED_FAILURES.filter((e) => !existsSync(e.path))) {
    failures += 1;
    console.log(
      `\nFAIL ${entry.path} is gone, and its expected-failure entry with it ` +
        `excuses nothing. Delete the entry from EXPECTED_FAILURES and update ` +
        `${where(entry)}.`,
    );
  }
}

const excused =
  known === 0
    ? ''
    : `, apart from ${known} known failure${known === 1 ? '' : 's'} recorded in ${STATEMENT}`;
console.log(
  failures === 0
    ? `\nEvery PDF conforms to PDF/UA-1 as far as a machine decides it${excused}.`
    : `\n${failures} failed. Passing is a floor: docs/MANUAL_TESTING.md holds the rest.`,
);

process.exit(failures === 0 ? 0 : EXIT_FAILED);
