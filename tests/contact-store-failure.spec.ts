import { expect, test } from './test';
import { captureConsole } from './console-capture';
import { FIELDS } from '../src/lib/contact-form';
import { handleSubmission } from '../src/lib/contact-submission';
import type { D1Database } from '../src/lib/contact-env';
import { NODE } from './tags';

// Called directly because the Worker suite cannot read Worker logs.

const NOW = Date.UTC(2026, 8, 22);

const TYPED = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  body: 'A message long enough to pass every rule it meets.',
};

const submission = (): FormData => {
  const form = new FormData();
  form.set(FIELDS.name, TYPED.name);
  form.set(FIELDS.email, TYPED.email);
  form.set(FIELDS.body, TYPED.body);
  return form;
};

const failingDatabase: D1Database = {
  prepare: () => {
    const statement = {
      bind: () => statement,
      run: async () => {
        throw new Error('D1_ERROR: database unavailable');
      },
      all: async () => ({ results: [] }),
    };
    return statement;
  },
};

test.describe('a message the database cannot store', NODE, () => {
  test('is logged without the name, email or message typed', async () => {
    const { value, logged } = await captureConsole(['error', 'warn'], () =>
      handleSubmission(
        submission(),
        { MESSAGES_DB: failingDatabase },
        NOW,
        null,
      ),
    );

    expect(value.kind, 'a failed write was not reported as failed.').toBe(
      'failed',
    );
    expect(logged.error, 'a failed write left no log line.').toEqual([
      'contact: message not stored: D1_ERROR: database unavailable',
    ]);

    const lines = [...logged.error, ...logged.warn].join(' ');
    for (const typed of Object.values(TYPED)) {
      expect(lines, `the log carries "${typed}".`).not.toContain(typed);
    }
  });
});
