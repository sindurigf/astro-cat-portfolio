/*
 * Deals the tests `playwright test --list` reports to the CI shards in turn, so
 * every spec spreads over every shard; `--shard` cuts the ordered list into runs
 * of whole specs, and the heavy ones cluster. Writes this shard's --test-list.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PLAYWRIGHT = 'node_modules/.bin/playwright';
/* The separator Playwright's --test-list reads between project, file and titles. */
const SEPARATOR = ' › ';
const LIST_BUFFER_BYTES = 256 * 1024 * 1024;

const usage =
  'Usage: node scripts/shard-tests.mjs <shard> <total> <out-file>, with 1 <= shard <= total.';

const [shardArg, totalArg, outFile] = process.argv.slice(2);
const shard = Number(shardArg);
const total = Number(totalArg);
if (
  !Number.isInteger(shard) ||
  !Number.isInteger(total) ||
  shard < 1 ||
  shard > total ||
  !outFile
) {
  throw new Error(usage);
}

const listTests = (extraArgs = []) => {
  const report = JSON.parse(
    execFileSync(
      PLAYWRIGHT,
      ['test', '--list', '--reporter=json', ...extraArgs],
      { encoding: 'utf8', maxBuffer: LIST_BUFFER_BYTES },
    ),
  );
  const lines = [];
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const parts = [...titles, spec.title];
        if (parts.some((part) => part.includes(SEPARATOR.trim()))) {
          throw new Error(
            `"${parts.join(' / ')}" contains "${SEPARATOR.trim()}", which --test-list cannot read; rename it.`,
          );
        }
        lines.push(
          [`[${test.projectName}]`, spec.file, ...parts].join(SEPARATOR),
        );
      }
    }
    for (const child of suite.suites ?? []) {
      walk(child, [...titles, child.title]);
    }
  };
  for (const file of report.suites) walk(file, []);
  return lines;
};

const all = listTests();
if (all.length === 0) throw new Error('playwright test --list found no tests.');
if (new Set(all).size !== all.length) {
  throw new Error('Two tests share a project, file and title path.');
}

const mine = all.filter((_, index) => index % total === shard - 1);
writeFileSync(outFile, `${mine.join('\n')}\n`);

/* Read back by Playwright itself: a title path that prefixes another would pull in extra tests. */
const selected = listTests(['--test-list', outFile]);
const expected = [...mine].sort().join('\n');
if ([...selected].sort().join('\n') !== expected) {
  throw new Error(
    `Shard ${shard}/${total}: --test-list selects ${selected.length} tests, not the ${mine.length} written.`,
  );
}

console.log(
  `Shard ${shard}/${total}: ${mine.length} of ${all.length} tests, every test in exactly one shard.`,
);
