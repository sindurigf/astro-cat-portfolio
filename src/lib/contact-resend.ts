import type { ContactEnv, D1Database } from './contact-env';
import {
  markNotified,
  recordFailedAttempt,
  sendNotification,
} from './contact-notification';
import { retentionCutoff } from './contact-retention';
import { HOUR_MS } from './time';

/*
 * Younger messages may still be mid-send in their own request; a resend would
 * email them twice. scripts/check-live.sh uses the same age:
 * tests/contact-resend.spec.ts fails when the two drift apart.
 */
export const RESEND_AFTER_MS = HOUR_MS;

/*
 * Each resend is one email and one D1 write, and a Worker invocation has a
 * subrequest limit. Anything past the batch waits for the next day's run.
 */
export const RESEND_BATCH = 20;

/*
 * A week of daily runs. Past it a message is left for check:live to report, so
 * one the mailer always refuses cannot take a batch slot every day.
 */
export const MAX_RESEND_ATTEMPTS = 7;

interface UnsentRow {
  id: string;
  name: string;
  email: string;
  body: string;
  created_at: number;
}

/**
 * Emails unsent notifications, fewest failed attempts first, then oldest.
 * Logs counts every run, zero included, so a stalled resend differs from an idle one.
 * Throws before reading any message when the mailer or recipient is missing,
 * so a config fault does not count against MAX_RESEND_ATTEMPTS.
 */
export const resendUnsentNotifications = async (
  database: D1Database,
  bindings: ContactEnv,
  now: number,
): Promise<number> => {
  if (!bindings.CONTACT_MAILER) {
    throw new Error('CONTACT_MAILER binding missing');
  }
  if (!bindings.CONTACT_NOTIFY_TO) {
    throw new Error('CONTACT_NOTIFY_TO secret missing');
  }

  const { results } = await database
    .prepare(
      'SELECT id, name, email, body, created_at FROM messages ' +
        'WHERE notified_at IS NULL AND created_at < ? AND created_at >= ? ' +
        'AND notify_attempts < ? ' +
        'ORDER BY notify_attempts, created_at LIMIT ?',
    )
    .bind(
      now - RESEND_AFTER_MS,
      retentionCutoff(now),
      MAX_RESEND_ATTEMPTS,
      RESEND_BATCH,
    )
    .all<UnsentRow>();

  let sent = 0;
  for (const row of results) {
    const submission = { name: row.name, email: row.email, body: row.body };
    if (
      await sendNotification(bindings, submission, new Date(row.created_at))
    ) {
      await markNotified(database, row.id, now);
      sent += 1;
    } else {
      await recordFailedAttempt(database, row.id);
    }
  }

  console.log(
    `notification resend: sent ${sent} of ${results.length} unsent notifications`,
  );
  return sent;
};
