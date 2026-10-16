import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { expect, test } from './test';
import { NODE } from './tags';
import {
  digest,
  staleStatementNotice,
  TEMPLATE_STATEMENT,
  templateStatementRows,
} from '../src/lib/statement-guard';
import { statementRow } from '../src/lib/statement-rows';
import { staleStatementGuard } from '../scripts/stale-statement.mjs';

/*
 * Privacy: a fork that publishes the shipped ACCESSIBILITY.md sends its
 * visitors' barrier reports to the template's maintainer. The values are read
 * from the file, never written here (scripts/check-leaks.mjs).
 */

const STATEMENT = readFileSync('ACCESSIBILITY.md', 'utf8');
const ROWS = ['Accessibility owner', 'Public reporting', 'Private reporting'];
const REAL_SITE = 'https://notexample.com';
const EXAMPLE_SITE = 'https://example.com';
/** Stands in for the demo's host, which is in no tracked file. */
const DEMO_HOST = 'demo.notexample.com';
const FORK_REPOSITORY = 'https://github.com/fork-owner/fork-site';
const CHECK_COULD_NOT_RUN = 2;

/** The repository the shipped Public reporting row belongs to. */
const STATEMENT_REPOSITORY = statementRow(
  STATEMENT,
  'Public reporting',
).replace(/\/issues$/, '');

const withRow = (statement: string, field: string, value: string): string =>
  statement.replace(
    new RegExp(`^(\\|\\s*${field}\\s*\\|)[^|]+\\|`, 'm'),
    `$1 ${value} |`,
  );

const REPLACED: Readonly<Record<string, string>> = {
  'Accessibility owner': 'Jane Doe',
  'Public reporting': `<${FORK_REPOSITORY}/issues>`,
  'Private reporting': '<jane@notexample.com>',
};

const replacing = (fields: readonly string[]): string =>
  fields.reduce(
    (statement, field) => withRow(statement, field, REPLACED[field]!),
    STATEMENT,
  );

const buildFailure = (
  siteUrl: string,
  repositoryUrl: string,
): string | null => {
  try {
    staleStatementGuard(siteUrl, repositoryUrl).hooks['astro:build:start']();
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

/** Runs the live check with a `curl` that records each call and reaches nothing. */
const runLiveCheck = (
  repositoryUrl: string,
): { status: number | null; stderr: string; requests: string } => {
  const bin = mkdtempSync(join(tmpdir(), 'check-live-'));
  const calls = join(bin, 'calls');
  const curl = join(bin, 'curl');
  writeFileSync(curl, `#!/bin/sh\necho "$@" >> "${calls}"\nexit 7\n`);
  chmodSync(curl, 0o755);
  try {
    const { status, stderr } = spawnSync('sh', ['scripts/check-live.sh'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env['PATH'] ?? ''}`,
        SITE_URL: REAL_SITE,
        REPOSITORY_URL: repositoryUrl,
        CHECK_LIVE_SKIP_D1: '1',
      },
    });
    return {
      status,
      stderr,
      requests: existsSync(calls) ? readFileSync(calls, 'utf8') : '',
    };
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
};

test.describe('a statement with its rows replaced', NODE, () => {
  test('is not flagged on a real site', () => {
    const statement = replacing(ROWS);

    expect(templateStatementRows(statement)).toEqual([]);
    expect(
      staleStatementNotice({
        siteUrl: REAL_SITE,
        repositoryUrl: FORK_REPOSITORY,
        statement,
      }),
    ).toBeNull();
  });
});

test.describe("the template maintainer's statement rows", NODE, () => {
  test.skip(
    templateStatementRows(STATEMENT).length === 0,
    'ACCESSIBILITY.md names its own owner and reporting routes',
  );

  test('are all recognized as shipped', () => {
    expect(templateStatementRows(STATEMENT)).toEqual(ROWS);
  });

  test('are named, each one left, on a real site with another repository', () => {
    const site = { siteUrl: REAL_SITE, repositoryUrl: FORK_REPOSITORY };

    const untouched = staleStatementNotice({ ...site, statement: STATEMENT });
    for (const row of ROWS) {
      expect(untouched, `the notice does not name ${row}.`).toContain(row);
    }

    const ownerReplaced = staleStatementNotice({
      ...site,
      statement: replacing(['Accessibility owner', 'Public reporting']),
    });
    expect(ownerReplaced).toContain('Private reporting');
    expect(ownerReplaced).not.toContain('Accessibility owner');
  });

  test('are left alone on an example host', () => {
    expect(
      staleStatementNotice({
        siteUrl: EXAMPLE_SITE,
        repositoryUrl: FORK_REPOSITORY,
        statement: STATEMENT,
      }),
      'a placeholder site was told its statement is stale.',
    ).toBeNull();
  });

  test("are left alone on the template's demo host with its repository, and nowhere else", () => {
    const template = { ...TEMPLATE_STATEMENT, demoHost: digest(DEMO_HOST) };
    const notice = (siteUrl: string, repositoryUrl: string) =>
      staleStatementNotice(
        { siteUrl, repositoryUrl, statement: STATEMENT },
        template,
      );

    expect(
      notice(`https://${DEMO_HOST}`, STATEMENT_REPOSITORY),
      "the template's own demo was told its statement is stale.",
    ).toBeNull();
    expect(
      notice(REAL_SITE, STATEMENT_REPOSITORY),
      "another host passed as the template's demo by naming its repository.",
    ).not.toBeNull();
    expect(
      notice(`https://${DEMO_HOST}`, FORK_REPOSITORY),
      "the demo's host passed with another repository.",
    ).not.toBeNull();
  });

  test('pass for no host but the recorded demo, even with the template repository', () => {
    expect(
      staleStatementNotice({
        siteUrl: REAL_SITE,
        repositoryUrl: STATEMENT_REPOSITORY,
        statement: STATEMENT,
      }),
    ).not.toBeNull();
  });

  test('fail the build of a real site, naming each row, and not of a placeholder', () => {
    const failure = buildFailure(REAL_SITE, STATEMENT_REPOSITORY);
    for (const row of ROWS) {
      expect(failure, `the build error does not name ${row}.`).toContain(row);
    }
    expect(buildFailure(EXAMPLE_SITE, FORK_REPOSITORY)).toBeNull();
  });

  test('stop the live check of a real site before it requests anything', () => {
    const { status, stderr, requests } = runLiveCheck(STATEMENT_REPOSITORY);

    for (const row of ROWS) {
      expect(stderr, `the check does not name ${row}.`).toContain(row);
    }
    expect(status).toBe(CHECK_COULD_NOT_RUN);
    expect(requests, 'the check fetched before stopping.').toBe('');
  });
});
