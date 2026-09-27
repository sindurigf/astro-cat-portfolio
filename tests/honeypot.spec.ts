import { expect, test } from './test';
import { captureConsole } from './console-capture';
import { FIELDS } from '../src/lib/contact-form';
import { handleSubmission } from '../src/lib/contact-submission';
import type { ContactEnv } from '../src/lib/contact-env';
import { NODE } from './tags';

// Called directly because the Worker suite cannot read Worker logs; the HTTP
// response is covered in tests/contact.spec.ts.

const NOW = Date.UTC(2026, 8, 22);

const submission = (honeypot: string): FormData => {
  const form = new FormData();
  form.set(FIELDS.name, 'Ada Lovelace');
  form.set(FIELDS.email, 'ada@example.com');
  form.set(FIELDS.body, 'A message long enough to pass every rule it meets.');
  if (honeypot !== '') form.set(FIELDS.honeypot, honeypot);
  return form;
};

/** No bindings at all: a caught submission must not reach one. */
const NOTHING_BOUND: ContactEnv = {};

const logsFrom = async <T>(run: () => Promise<T>) => {
  const { value, logged } = await captureConsole(['warn'], run);
  return { value, logged: logged.warn };
};

test.describe('a filled honeypot', NODE, () => {
  test('is recorded, and the record names nothing that was typed', async () => {
    const { value, logged } = await logsFrom(() =>
      handleSubmission(
        submission('https://spam.example'),
        NOTHING_BOUND,
        NOW,
        null,
      ),
    );

    expect(value.kind, 'a caught submission is answered as a success.').toBe(
      'sent',
    );
    expect(logged, 'a discarded honeypot submission left no log line.').toEqual(
      ['contact: submission discarded: honeypot filled'],
    );

    const line = logged.join(' ');
    for (const typed of ['Ada Lovelace', 'ada@example.com', 'spam.example']) {
      expect(line, `the log line carries ${typed}.`).not.toContain(typed);
    }
  });

  test('an empty one is not recorded, and the submission goes on', async () => {
    const { value, logged } = await logsFrom(() =>
      handleSubmission(submission(''), NOTHING_BOUND, NOW, null),
    );

    expect(
      value.kind,
      'an ordinary submission stopped before storage, which is unbound here.',
    ).toBe('failed');

    expect(
      logged.filter((line) => line.includes('honeypot')),
      'an ordinary submission was logged as caught.',
    ).toEqual([]);
  });
});
