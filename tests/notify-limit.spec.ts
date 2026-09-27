import { expect, test } from './test';
import { captureConsole } from './console-capture';
import {
  HOURLY_NOTIFY_LIMIT,
  withinHourlyNotifyLimit,
} from '../src/lib/contact-submission';
import type { D1Database } from '../src/lib/contact-env';
import { NODE } from './tags';

/**
 * Past the hourly limit a message is stored but not emailed, so a flood from
 * many addresses cannot fill the owner's inbox. Called directly: the Worker
 * suite cannot store that many messages without tripping the per-address limit.
 */

const NOW = Date.UTC(2026, 8, 25);
const ONE_HOUR_EARLIER = Date.UTC(2026, 8, 24, 23);

/** Every value the count query was bound to. */
const bound: unknown[][] = [];

const databaseHolding = (stored: number | Error): D1Database => ({
  prepare: () => {
    const statement = {
      bind: (...values: unknown[]) => {
        bound.push(values);
        return statement;
      },
      run: async () => ({ meta: { changes: 0 } }),
      all: async <Row>() => {
        if (stored instanceof Error) throw stored;
        return { results: [{ stored }] as Row[] };
      },
    };
    return statement;
  },
});

const warningsFrom = async (run: () => Promise<boolean>) => {
  const { value, logged } = await captureConsole(['warn'], run);
  return { within: value, logged: logged.warn };
};

test(
  'emails a message while the last hour holds no more than the limit',
  NODE,
  async () => {
    const { within, logged } = await warningsFrom(() =>
      withinHourlyNotifyLimit(databaseHolding(HOURLY_NOTIFY_LIMIT), NOW),
    );
    expect(within).toBe(true);
    expect(logged).toEqual([]);
    expect(
      bound.at(-1),
      'the count should cover messages stored in the last hour.',
    ).toEqual([ONE_HOUR_EARLIER]);
  },
);

test('defers the email past the limit, and logs the count', NODE, async () => {
  const { within, logged } = await warningsFrom(() =>
    withinHourlyNotifyLimit(databaseHolding(HOURLY_NOTIFY_LIMIT + 1), NOW),
  );
  expect(within, 'a flood past the limit was still emailed.').toBe(false);
  expect(logged).toEqual([
    `contact: notification deferred to the daily resend: ${HOURLY_NOTIFY_LIMIT + 1} messages in the last hour`,
  ]);
});

test('emails the message when the count cannot be read', NODE, async () => {
  const { within, logged } = await warningsFrom(() =>
    withinHourlyNotifyLimit(databaseHolding(new Error('D1 unavailable')), NOW),
  );
  expect(within, 'an unreadable count blocked the email.').toBe(true);
  expect(logged).toEqual(['contact: hourly count not read: D1 unavailable']);
});
