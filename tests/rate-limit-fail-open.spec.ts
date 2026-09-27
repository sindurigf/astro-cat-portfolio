import { expect, test } from './test';
import { captureConsole } from './console-capture';
import { isRateLimited } from '../src/lib/contact-submission';
import type { RateLimiter } from '../src/lib/contact-env';
import { NODE } from './tags';

/**
 * `isRateLimited` fails open, logging why, when the binding is missing, the
 * request has no address, or the limiter throws. Called directly: none of the
 * three is reachable through the local Worker, whose log is not readable.
 */

const allows: RateLimiter = { limit: async () => ({ success: true }) };
const refuses: RateLimiter = { limit: async () => ({ success: false }) };
const throws: RateLimiter = {
  limit: async () => {
    throw new Error('rate limiter unavailable');
  },
};

/** A key of the shape `rateLimitKey` returns: a SHA-256 in hex. */
const KEY = 'a'.repeat(64);

const warningsFrom = async (run: () => Promise<boolean>) => {
  const { value, logged } = await captureConsole(['warn'], run);
  return { limited: value, logged: logged.warn };
};

test.describe('rate limiting that cannot run', NODE, () => {
  test('a missing CONTACT_RATE_LIMIT binding is logged, and the submission still goes through', async () => {
    const { limited, logged } = await warningsFrom(() =>
      isRateLimited(undefined, KEY),
    );

    expect(limited, 'a missing binding blocked the submission.').toBe(false);
    expect(
      logged,
      'a missing binding turned rate limiting off without a log line.',
    ).toEqual([
      'contact: submission not rate limited: CONTACT_RATE_LIMIT binding missing',
    ]);
  });

  test('a request with no address is logged, and the submission still goes through', async () => {
    const { limited, logged } = await warningsFrom(() =>
      isRateLimited(allows, null),
    );

    expect(limited, 'a request without an address was blocked.').toBe(false);
    expect(
      logged,
      'a request without an address skipped the limiter without a log line.',
    ).toEqual([
      'contact: submission not rate limited: request carries no address',
    ]);
  });

  test('a limiter that throws is logged, and the submission still goes through', async () => {
    const { limited, logged } = await warningsFrom(() =>
      isRateLimited(throws, KEY),
    );

    expect(limited, 'a failing limiter blocked the submission.').toBe(false);
    expect(logged, 'the limiter failed without a log line.').toEqual([
      'contact: submission not rate limited: rate limiter unavailable',
    ]);
  });

  test('the log lines carry no key and no address', async () => {
    const { logged } = await warningsFrom(() => isRateLimited(undefined, KEY));

    expect(
      logged.join(' '),
      'the log line carries the rate-limit key, from which the address is recoverable.',
    ).not.toContain(KEY);
  });

  test('a limiter that answers is left to decide, and logs nothing', async () => {
    const under = await warningsFrom(() => isRateLimited(allows, KEY));
    const over = await warningsFrom(() => isRateLimited(refuses, KEY));

    expect(under.limited, 'a submission under the limit was blocked.').toBe(
      false,
    );
    expect(over.limited, 'a submission over the limit went through.').toBe(
      true,
    );
    expect(
      [...under.logged, ...over.logged],
      'a working limiter wrote to the log.',
    ).toEqual([]);
  });
});
