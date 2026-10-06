/* Shared by the form page and the endpoint: a renamed field reads as blank. */

export const FIELDS = {
  name: 'name',
  email: 'email',
  body: 'message',
  /* Honeypot: named for something a form filler wants to complete. */
  honeypot: 'website',
} as const;

/** In code points, after line breaks are normalized to `\n`. */
export const LIMITS = {
  nameMin: 1,
  nameMax: 100,
  emailMax: 254,
  bodyMin: 10,
  bodyMax: 5000,
} as const;

export const RETENTION_DAYS = 180;

/* 4 UTF-8 bytes per character, 3 characters per percent-encoded byte. */
const ENCODED_BYTES_PER_CHARACTER = 12;

/* Field names, `=`, `&`, and the honeypot, which has no limit of its own. */
const ENVELOPE_BYTES = 256;

/* Derived, so raising a limit cannot put the cap below what the form takes. */
export const MAX_BODY_BYTES =
  (LIMITS.nameMax + LIMITS.emailMax + LIMITS.bodyMax) *
    ENCODED_BYTES_PER_CHARACTER +
  ENVELOPE_BYTES;

export const FORM_MEDIA_TYPE = 'application/x-www-form-urlencoded';

export type FieldName = 'name' | 'email' | 'body';

export interface ContactSubmission {
  name: string;
  email: string;
  body: string;
}

export interface FieldError {
  field: FieldName;
  message: string;
}

type ValidationResult =
  | { ok: true; value: ContactSubmission }
  | { ok: false; errors: FieldError[]; submitted: Partial<ContactSubmission> };

/*
 * Deliberately permissive: catches typos only. Except `,` and `;`, which would
 * add a second `Reply-To` recipient, and `<>"():[]\` and control characters,
 * which a mailer may refuse as a `Reply-To`, failing every resend.
 */
const NOT_IN_ADDRESS = String.raw`\s\p{Cc}@,;<>"():\[\]\\`;
const EMAIL_SHAPE = new RegExp(
  `^[^${NOT_IN_ADDRESS}]+@[^${NOT_IN_ADDRESS}]+\\.[^${NOT_IN_ADDRESS}]+$`,
  'u',
);

/* Form submission sends every textarea line break as CRLF. */
const readField = (form: FormData, key: string): string => {
  const raw = form.get(key);
  return typeof raw === 'string' ? raw.replaceAll('\r\n', '\n').trim() : '';
};

/* Code points: `length` counts most emoji as two. */
const characters = (value: string): number => [...value].length;

/* Each is read alone by a screen reader after the error summary. */
const MESSAGES = {
  nameMissing: 'Enter a name. Anything you want to be called is fine.',
  nameLong: `Use ${LIMITS.nameMax} characters or fewer for the name.`,
  emailMissing: 'Enter an email address so there is a way to reply.',
  emailShape: 'Check the email address. It needs an @ and a domain.',
  emailLong: `Use ${LIMITS.emailMax} characters or fewer for the email address.`,
  bodyMissing: 'Write a message.',
  bodyShort: `Write at least ${LIMITS.bodyMin} characters.`,
  bodyLong: `Use ${LIMITS.bodyMax} characters or fewer. Email works for anything longer.`,
} as const;

/** What was typed, trimmed and unchecked, for refilling the form. */
export const readSubmission = (form: FormData): ContactSubmission => ({
  name: readField(form, FIELDS.name),
  email: readField(form, FIELDS.email),
  body: readField(form, FIELDS.body),
});

/** Collects every error, not just the first. */
export const validateSubmission = (form: FormData): ValidationResult => {
  const submitted = readSubmission(form);
  const { name, email, body } = submitted;
  const nameLength = characters(name);
  const emailLength = characters(email);
  const bodyLength = characters(body);

  const errors: FieldError[] = [];

  if (nameLength < LIMITS.nameMin) {
    errors.push({ field: 'name', message: MESSAGES.nameMissing });
  } else if (nameLength > LIMITS.nameMax) {
    errors.push({ field: 'name', message: MESSAGES.nameLong });
  }

  if (emailLength === 0) {
    errors.push({ field: 'email', message: MESSAGES.emailMissing });
  } else if (emailLength > LIMITS.emailMax) {
    errors.push({ field: 'email', message: MESSAGES.emailLong });
  } else if (!EMAIL_SHAPE.test(email)) {
    errors.push({ field: 'email', message: MESSAGES.emailShape });
  }

  if (bodyLength === 0) {
    errors.push({ field: 'body', message: MESSAGES.bodyMissing });
  } else if (bodyLength < LIMITS.bodyMin) {
    errors.push({ field: 'body', message: MESSAGES.bodyShort });
  } else if (bodyLength > LIMITS.bodyMax) {
    errors.push({ field: 'body', message: MESSAGES.bodyLong });
  }

  return errors.length > 0
    ? { ok: false, errors, submitted }
    : { ok: true, value: { name, email, body } };
};

/*
 * Answered as a success so a bot learns nothing. Rejected: hiding the
 * field with CSS, not `hidden`, would show it to a person when CSS fails.
 */
export const looksAutomated = (form: FormData): boolean =>
  readField(form, FIELDS.honeypot).length > 0;
