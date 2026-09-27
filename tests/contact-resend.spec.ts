import { readFileSync } from 'node:fs';
import { expect, test } from './test';
import { captureConsole } from './console-capture';
import {
  MAX_RESEND_ATTEMPTS,
  RESEND_AFTER_MS,
  RESEND_BATCH,
  resendUnsentNotifications,
} from '../src/lib/contact-resend';
import { retentionCutoff } from '../src/lib/contact-retention';
import type {
  ContactEnv,
  D1Database,
  EmailMessageBuilder,
} from '../src/lib/contact-env';
import { NODE } from './tags';

/**
 * The daily resend of notifications that never went out, called rather than
 * triggered: the Worker suite cannot read what the Worker logs.
 * `tests/contact.spec.ts` triggers the real cron against local D1.
 */

const NOW = Date.UTC(2026, 8, 25);

const ROW = {
  id: 'unsent-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  body: 'A message whose notification failed.',
  created_at: NOW - 2 * RESEND_AFTER_MS,
};

/** A database holding `rows` unsent, recording every statement it is sent. */
const databaseWith = (rows: (typeof ROW)[]) => {
  const sent: { sql: string; values: unknown[] }[] = [];
  const database: D1Database = {
    prepare: (sql) => {
      const statement = {
        bind: (...values: unknown[]) => {
          sent.push({ sql, values });
          return statement;
        },
        run: async () => ({ meta: { changes: 1 } }),
        all: async <Row>() => ({ results: rows as Row[] }),
      };
      return statement;
    },
  };
  return { database, sent };
};

const mailer = (accepts: boolean) => {
  const delivered: EmailMessageBuilder[] = [];
  const bindings: ContactEnv = {
    CONTACT_NOTIFY_TO: 'owner@example.com',
    CONTACT_MAILER: {
      send: async (message) => {
        if (!accepts) throw new Error('mailer refused');
        delivered.push(message);
        return { messageId: 'id' };
      },
    },
  };
  return { bindings, delivered };
};

const quietly = async <T>(run: () => Promise<T>) => {
  const { value, logged } = await captureConsole(['log', 'error'], run);
  return { value, logged: logged.log, errors: logged.error };
};

const marks = (sent: { sql: string; values: unknown[] }[]) =>
  sent.filter(({ sql }) => sql.startsWith('UPDATE messages SET notified_at'));

test.describe('the notification resend', NODE, () => {
  test('emails an unsent message and marks it sent', async () => {
    const { database, sent } = databaseWith([ROW]);
    const { bindings, delivered } = mailer(true);

    const { value, logged, errors } = await quietly(() =>
      resendUnsentNotifications(database, bindings, NOW),
    );

    expect(value).toBe(1);
    expect(errors, 'a successful resend logged an error').toEqual([]);
    expect(delivered[0]?.text).toContain(ROW.body);
    expect(delivered[0]?.text).toContain(
      new Date(ROW.created_at).toISOString(),
    );
    expect(marks(sent).map(({ values }) => values)).toEqual([[NOW, ROW.id]]);
    expect(logged).toEqual([
      'notification resend: sent 1 of 1 unsent notifications',
    ]);
  });

  test('leaves a message unmarked when the email fails again', async () => {
    const { database, sent } = databaseWith([ROW]);
    const { bindings } = mailer(false);

    const { value, logged, errors } = await quietly(() =>
      resendUnsentNotifications(database, bindings, NOW),
    );

    expect(value).toBe(0);
    expect(errors, 'a failed resend was not logged as an error').toEqual([
      expect.stringContaining('notification not sent'),
    ]);
    expect(
      marks(sent),
      'a notification that failed was marked sent, so it is never resent ' +
        'and check:live never counts it.',
    ).toEqual([]);
    expect(
      sent
        .filter(({ sql }) => sql.includes('notify_attempts + 1'))
        .map(({ values }) => values),
      'a failed resend was not counted, so a message the mailer always ' +
        'refuses would take a batch slot every day.',
    ).toEqual([[ROW.id]]);
    expect(logged).toEqual([
      'notification resend: sent 0 of 1 unsent notifications',
    ]);
  });

  test('skips messages younger than the grace period, in batches', async () => {
    const { database, sent } = databaseWith([]);
    const { bindings } = mailer(true);

    const { logged } = await quietly(() =>
      resendUnsentNotifications(database, bindings, NOW),
    );

    expect(
      sent[0]?.values,
      'the resend must skip messages past retention, even when the sweep failed.',
    ).toEqual([
      NOW - RESEND_AFTER_MS,
      retentionCutoff(NOW),
      MAX_RESEND_ATTEMPTS,
      RESEND_BATCH,
    ]);
    expect(
      logged,
      'a run with nothing to send logged nothing, which looks the same as a ' +
        'resend that never ran.',
    ).toEqual(['notification resend: sent 0 of 0 unsent notifications']);
  });

  for (const missing of ['CONTACT_MAILER', 'CONTACT_NOTIFY_TO'] as const) {
    test(`fails the run without counting attempts when ${missing} is missing`, async () => {
      const { database, sent } = databaseWith([ROW]);
      const { bindings } = mailer(true);
      delete bindings[missing];

      const { logged } = await captureConsole(['error', 'log'], () =>
        expect(
          resendUnsentNotifications(database, bindings, NOW),
        ).rejects.toThrow(missing),
      );

      expect(
        sent,
        'a missing binding or secret touched the database, so a config fault ' +
          "spends every message's resend attempts.",
      ).toEqual([]);
      expect(
        logged.error,
        'the resend logged per message; the cron handler logs the throw once.',
      ).toEqual([]);
    });
  }

  test("a mailer error that quotes the sender's address is logged without it", async () => {
    const { database } = databaseWith([ROW]);
    const bindings: ContactEnv = {
      CONTACT_NOTIFY_TO: 'owner@example.com',
      CONTACT_MAILER: {
        send: async () => {
          throw new Error(`Invalid Reply-To: ${ROW.email}`);
        },
      },
    };
    const { logged } = await captureConsole(['error', 'log'], () =>
      resendUnsentNotifications(database, bindings, NOW),
    );
    const errors = logged.error;

    expect(errors.join('\n'), 'no mailer error was logged.').toContain(
      'Invalid Reply-To',
    );
    expect(
      errors.join('\n'),
      "a visitor's email address reached the Worker logs.",
    ).not.toContain(ROW.email);
  });

  test('check:live counts with the same grace period', () => {
    const script = readFileSync('scripts/check-live.sh', 'utf8');
    expect(
      script.match(/^RESEND_AFTER_MS=(\d+)$/m)?.[1],
      'scripts/check-live.sh and src/lib/contact-resend.ts disagree on when ' +
        'a message counts as unsent, so check:live fails on messages the ' +
        'resend is still waiting to send, or misses ones it gave up on.',
    ).toBe(String(RESEND_AFTER_MS));
  });
});
