import { expect, test } from './test';
import {
  FIELDS,
  LIMITS,
  validateSubmission,
  type FieldName,
} from '../src/lib/contact-form';
import { NODE } from './tags';

const form = (fields: Partial<Record<FieldName, string>>): FormData => {
  const data = new FormData();
  for (const [field, value] of Object.entries(fields)) {
    data.set(FIELDS[field as FieldName], value);
  }
  return data;
};

const VALID = {
  name: 'Ada',
  email: 'ada@example.com',
  body: 'x'.repeat(LIMITS.bodyMin),
};

const failing = (fields: Partial<Record<FieldName, string>>): FieldName[] => {
  const result = validateSubmission(form(fields));
  return result.ok ? [] : result.errors.map((error) => error.field);
};

test('accepts every field at its limits', NODE, () => {
  expect(failing(VALID)).toEqual([]);
  expect(
    failing({
      name: 'n'.repeat(LIMITS.nameMax),
      email: `${'e'.repeat(LIMITS.emailMax - '@x.io'.length)}@x.io`,
      body: 'b'.repeat(LIMITS.bodyMax),
    }),
  ).toEqual([]);
});

test('rejects each field one past its limit, and only that field', NODE, () => {
  expect(failing({ ...VALID, name: 'n'.repeat(LIMITS.nameMax + 1) })).toEqual([
    'name',
  ]);
  expect(
    failing({ ...VALID, email: `${'e'.repeat(LIMITS.emailMax)}@x.io` }),
  ).toEqual(['email']);
  expect(failing({ ...VALID, body: 'b'.repeat(LIMITS.bodyMin - 1) })).toEqual([
    'body',
  ]);
  expect(failing({ ...VALID, body: 'b'.repeat(LIMITS.bodyMax + 1) })).toEqual([
    'body',
  ]);
});

test('treats whitespace alone as missing', NODE, () => {
  expect(failing({ name: '   ', email: ' \t ', body: '\n\n' })).toEqual([
    'name',
    'email',
    'body',
  ]);
});

test(
  'rejects an address without an @ and a dotted domain, with a second recipient, or with characters a mailer refuses',
  NODE,
  () => {
    for (const email of [
      'ada',
      'ada@',
      'ada@example',
      '@example.com',
      'a@b.c,d@e.f',
      'a@b.c;d@e.f',
      'a b@c.d',
      'Ada <ada@example.com>',
      '"ada"@example.com',
      'ada(x)@example.com',
      'ada:x@example.com',
      'ada\u0007@example.com',
      'ada\u0085@example.com',
      'ada[x]@example.com',
      'ada\\x@example.com',
    ]) {
      expect(failing({ ...VALID, email }), email).toEqual(['email']);
    }
  },
);

test('reports every failing field at once, each with a message', NODE, () => {
  const result = validateSubmission(form({}));
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.errors.map((error) => error.field)).toEqual([
    'name',
    'email',
    'body',
  ]);
  for (const error of result.errors) expect(error.message.trim()).not.toBe('');
  expect(new Set(result.errors.map((error) => error.message)).size).toBe(3);
});

/** One line of the CRLF body, its break counted as one character. */
const LINE_CHARS = 50;

test(
  'counts a CRLF line break as one character and stores it as LF',
  NODE,
  () => {
    const paragraph = 'p'.repeat(LINE_CHARS - 1);
    const body = Array(Math.floor(LIMITS.bodyMax / LINE_CHARS))
      .fill(paragraph)
      .join('\r\n');
    expect(
      body.length,
      'the body fits even with CRLF counted as two, so this checks nothing.',
    ).toBeGreaterThan(LIMITS.bodyMax);
    const result = validateSubmission(form({ ...VALID, body }));

    expect(
      result.ok,
      'a message under the limit was refused because each line break counted as two.',
    ).toBe(true);
    if (!result.ok) return;
    expect(result.value.body).not.toContain('\r');
  },
);

test('counts an emoji as one character', NODE, () => {
  expect(failing({ ...VALID, body: '🐈'.repeat(LIMITS.bodyMax) })).toEqual([]);
  expect(failing({ ...VALID, body: '🐈'.repeat(LIMITS.bodyMax + 1) })).toEqual([
    'body',
  ]);
});
