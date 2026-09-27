import type { ContactEnv, D1Database } from './contact-env';
import {
  looksAutomated,
  readSubmission,
  validateSubmission,
  type ContactSubmission,
  type FieldError,
} from './contact-form';
import { markNotified, sendNotification } from './contact-notification';
import { HOUR_MS } from './time';
import { errorMessage } from './errors';

export type SubmissionKind = 'sent' | 'invalid' | 'limited' | 'failed';

interface SubmissionResult {
  kind: SubmissionKind;
  /** What to refill the form with when it is rendered again. */
  values: Partial<ContactSubmission>;
  errors: FieldError[];
}

const SENT: SubmissionResult = { kind: 'sent', values: {}, errors: [] };

/*
 * The per-address limit does nothing against many addresses. Past this many
 * messages in an hour, new ones are stored but not emailed, and the daily
 * resend sends them in batches, so a flood cannot fill the owner's inbox.
 */
export const HOURLY_NOTIFY_LIMIT = 20;

/*
 * Fails open, with a `warn`, on a missing binding, no address or a throwing
 * limiter. Exported for tests/rate-limit-fail-open.spec.ts: no HTTP test
 * reaches these paths.
 */
export const isRateLimited = async (
  limiter: ContactEnv['CONTACT_RATE_LIMIT'],
  key: string | null,
): Promise<boolean> => {
  if (!limiter) {
    console.warn(
      'contact: submission not rate limited: CONTACT_RATE_LIMIT binding missing',
    );
    return false;
  }

  /* Never log the key: an address is recoverable from it. */
  if (key === null) {
    console.warn(
      'contact: submission not rate limited: request carries no address',
    );
    return false;
  }

  try {
    const { success } = await limiter.limit({ key });
    return !success;
  } catch (error) {
    console.warn('contact: submission not rate limited:', errorMessage(error));
    return false;
  }
};

/** The new row's ID once it is written, or null. */
const store = async (
  database: D1Database | undefined,
  submission: ContactSubmission,
  now: number,
): Promise<string | null> => {
  if (!database) {
    console.error('contact: message not stored: MESSAGES_DB binding missing');
    return null;
  }

  const id = crypto.randomUUID();
  try {
    await database
      .prepare(
        'INSERT INTO messages (id, name, email, body, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(id, submission.name, submission.email, submission.body, now)
      .run();
    return id;
  } catch (error) {
    /* Never log the submission: /privacy promises only the row is kept. */
    console.error('contact: message not stored:', errorMessage(error));
    return null;
  }
};

/** Fails open, with a `warn`: a count that cannot be read never blocks an email. */
export const withinHourlyNotifyLimit = async (
  database: D1Database,
  now: number,
): Promise<boolean> => {
  try {
    const { results } = await database
      .prepare('SELECT COUNT(*) AS stored FROM messages WHERE created_at > ?')
      .bind(now - HOUR_MS)
      .all<{ stored: number }>();
    const stored = results[0]?.stored ?? 0;
    if (stored <= HOURLY_NOTIFY_LIMIT) return true;
    console.warn(
      `contact: notification deferred to the daily resend: ${stored} messages in the last hour`,
    );
    return false;
  } catch (error) {
    console.warn('contact: hourly count not read:', errorMessage(error));
    return true;
  }
};

/** `limitKey` is the hashed sender key, or null when the request has no address. */
export const handleSubmission = async (
  form: FormData,
  bindings: ContactEnv,
  now: number,
  limitKey: string | null,
): Promise<SubmissionResult> => {
  /* Answered as a success; the log is the only record a person was caught. */
  if (looksAutomated(form)) {
    console.warn('contact: submission discarded: honeypot filled');
    return SENT;
  }

  if (await isRateLimited(bindings.CONTACT_RATE_LIMIT, limitKey)) {
    return { kind: 'limited', values: readSubmission(form), errors: [] };
  }

  const result = validateSubmission(form);
  if (!result.ok) {
    return { kind: 'invalid', values: result.submitted, errors: result.errors };
  }

  const database = bindings.MESSAGES_DB;
  const id = await store(database, result.value, now);
  if (!database || id === null) {
    return { kind: 'failed', values: readSubmission(form), errors: [] };
  }

  /* An unsent notification stays unmarked for the daily resend. */
  if (
    (await withinHourlyNotifyLimit(database, now)) &&
    (await sendNotification(bindings, result.value, new Date(now)))
  ) {
    await markNotified(database, id, now);
  }
  return SENT;
};
