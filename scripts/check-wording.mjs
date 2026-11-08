/*
 * Fails on third-person references to the maintainer and on em dashes in
 * tracked text: docs, comments and published copy. `--text <file>` checks one
 * file outside the tree instead, as CI does for the pull request title and body.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORDING_EXCEPTIONS as EXCEPTIONS } from './check-allow-lists.mjs';

const ROOT =
  process.env.CHECK_ROOT ?? fileURLToPath(new URL('..', import.meta.url));

const WORDING_RULES = [
  {
    rule: 'the-owner',
    pattern: /(?:^|[^\p{L}\p{N}])the owner(?![\p{L}\p{N}])|owner['’]s/iu,
    fix: 'write in the first person or with no subject, or say "maintainer"',
  },
  {
    rule: 'she-her',
    pattern:
      /(?<![\p{L}\p{N}_/.-])(?:she|her|hers|herself)(?![\p{L}\p{N}_/-]|\.[\p{L}\p{N}])/iu,
    fix: 'write in the first person or with no subject',
  },
  {
    rule: 'site-owner',
    pattern: /site owner/iu,
    fix: 'say "maintainer"',
  },
  {
    rule: 'em-dash',
    pattern: /—|&mdash;|\\u2014/u,
    fix: 'use a comma, colon or full stop',
  },
];

const SELF = new Set([
  'scripts/check-wording.mjs',
  'tests/check-wording.spec.ts',
]);
const SKIPPED = new Set(['package-lock.json']);
const BINARY =
  /\.(?:avif|gif|ico|jpe?g|mp3|mp4|otf|pdf|png|ttf|webm|webp|woff2?|zip)$/i;

const exceptionsSeen = new Set();

const fileMatches = (entry, name) =>
  entry.file instanceof RegExp ? entry.file.test(name) : entry.file === name;

const isException = (name, rule, line) =>
  EXCEPTIONS.some((entry, i) => {
    const hit =
      entry.rule === rule && fileMatches(entry, name) && entry.text.test(line);
    if (hit) exceptionsSeen.add(i);
    return hit;
  });

const findingsIn = (name, source, { exceptions }) =>
  source
    .split('\n')
    .flatMap((line, index) =>
      WORDING_RULES.filter(
        ({ rule, pattern }) =>
          pattern.test(line) && !(exceptions && isException(name, rule, line)),
      ).map(
        ({ rule, fix }) =>
          `${name}:${index + 1}  ${rule}: ${line.trim()}\n      Fix: ${fix}.`,
      ),
    );

const trackedFiles = () => {
  try {
    return execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: ROOT, encoding: 'utf8' },
    )
      .split('\0')
      .filter(Boolean);
  } catch (error) {
    console.error(
      `check:wording could not list files with git in ${ROOT}: ${error.message}`,
    );
    process.exit(1);
  }
};

const readText = (name) => {
  const source = readFileSync(join(ROOT, name), 'utf8');
  return source.includes('\0') ? null : source;
};

const checkTree = () => {
  const names = trackedFiles().filter(
    (name) => !SELF.has(name) && !SKIPPED.has(name) && !BINARY.test(name),
  );
  if (names.length === 0) return [`${ROOT}  no tracked text file to check`];
  const failures = names.flatMap((name) => {
    const source = readText(name);
    return source === null
      ? []
      : findingsIn(name, source, { exceptions: true });
  });
  EXCEPTIONS.forEach((entry, i) => {
    if (!exceptionsSeen.has(i)) {
      failures.push(
        `${entry.file}  ${entry.rule} exception ${entry.text} no longer matches; remove it from WORDING_EXCEPTIONS in scripts/check-allow-lists.mjs`,
      );
    }
  });
  return failures;
};

const textArgument = process.argv.indexOf('--text');
const textFile = textArgument === -1 ? null : process.argv[textArgument + 1];
if (textArgument !== -1 && !textFile) {
  console.error('check:wording --text needs a file to read.');
  process.exit(1);
}

const failures = textFile
  ? findingsIn(textFile, readFileSync(textFile, 'utf8'), { exceptions: false })
  : checkTree();

if (failures.length > 0) {
  console.error(`Found ${failures.length} wording problem(s):\n`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    '\nA real use, such as alt text or a quote, goes in WORDING_EXCEPTIONS with its reason.',
  );
  process.exit(1);
}

console.log(
  textFile
    ? 'Wording: the text names nobody in the third person and has no em dash.'
    : 'Wording: no third-person maintainer references or em dashes outside WORDING_EXCEPTIONS.',
);
