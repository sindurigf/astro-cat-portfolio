import { expect, test } from './test';
import { captureConsole } from './console-capture';
import { deleteExpiredMessages } from '../src/lib/contact-retention';
import { RETENTION_DAYS } from '../src/lib/contact-form';
import type { D1Database } from '../src/lib/contact-env';
import { NODE } from './tags';

// Called directly because Playwright cannot read `webServer` output; the real
// sweep against local D1 is covered in tests/contact.spec.ts.

const NOW = Date.UTC(2026, 8, 22);

/** `Date.UTC` rolls a negative day back through the months. */
const CUTOFF = Date.UTC(2026, 8, 22 - RETENTION_DAYS);

/** A database whose DELETE reports `changes` rows, recording what it was sent. */
const databaseReporting = (changes: number) => {
  const sent: { sql: string; values: unknown[] }[] = [];
  const database: D1Database = {
    prepare: (sql) => ({
      bind: (...values) => {
        sent.push({ sql, values });
        return {
          bind: () => {
            throw new Error('bound twice');
          },
          run: async () => ({ meta: { changes } }),
          all: async () => ({ results: [] }),
        };
      },
      run: async () => ({ meta: { changes } }),
      all: async () => ({ results: [] }),
    }),
  };
  return { database, sent };
};

const logsFrom = async <T>(run: () => Promise<T>) => {
  const { value, logged } = await captureConsole(['log'], run);
  return { value, logged: logged.log };
};

const lineFor = (count: number): string =>
  `retention sweep: deleted ${count} of the messages older than ` +
  `${RETENTION_DAYS} days`;

test.describe('the retention sweep', NODE, () => {
  test('says how many messages it deleted', async () => {
    const { database, sent } = databaseReporting(3);
    const { value, logged } = await logsFrom(() =>
      deleteExpiredMessages(database, NOW),
    );

    expect(value).toBe(3);
    expect(logged, 'the sweep left no record of what it removed.').toEqual([
      lineFor(3),
    ]);
    expect(
      sent[0]?.values,
      `the sweep should delete messages older than ${RETENTION_DAYS} days.`,
    ).toEqual([CUTOFF]);
  });

  test('says so when there was nothing to delete', async () => {
    const { database } = databaseReporting(0);
    const { logged } = await logsFrom(() =>
      deleteExpiredMessages(database, NOW),
    );

    expect(logged, 'a run that deleted nothing logged nothing.').toEqual([
      lineFor(0),
    ]);
  });
});
