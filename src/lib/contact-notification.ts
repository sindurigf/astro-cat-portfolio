import type {
  ContactEnv,
  D1Database,
  EmailMessageBuilder,
} from './contact-env';
import type { ContactSubmission } from './contact-form';
import { errorMessage } from './errors';
import { SITE_NAME } from './site';
import { SITE_CONFIG } from '../site.config';

/*
 * Must match `allowed_sender_addresses` in wrangler.jsonc, which rejects any
 * other sender. tests/contact.spec.ts reads both.
 */
export const NOTIFICATION_SENDER = {
  email: SITE_CONFIG.contact.notificationSender,
  name: `${SITE_NAME} contact form`,
} as const;

/* Validation trims but keeps inner control characters; a header cannot. */
const oneLine = (value: string): string =>
  value.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').trim();

/** The email that tells the site owner a message arrived. */
export const notificationFor = (
  submission: ContactSubmission,
  to: string,
  receivedAt: Date,
): EmailMessageBuilder => ({
  to,
  from: NOTIFICATION_SENDER,
  replyTo: submission.email,
  subject: `Contact form: ${oneLine(submission.name)}`,
  text: [
    `From: ${oneLine(submission.name)} <${submission.email}>`,
    `Received: ${receivedAt.toISOString()}`,
    '',
    submission.body,
  ].join('\n'),
});

/**
 * Emails the site owner about one stored message. True once the mailer
 * accepts it; every failure is logged with its reason and never the message.
 */
export const sendNotification = async (
  bindings: ContactEnv,
  submission: ContactSubmission,
  receivedAt: Date,
): Promise<boolean> => {
  const sender = bindings.CONTACT_MAILER;
  const recipient = bindings.CONTACT_NOTIFY_TO;

  if (!sender) {
    console.error(
      'contact: notification not sent: CONTACT_MAILER binding missing',
    );
    return false;
  }
  if (!recipient) {
    console.error(
      'contact: notification not sent: CONTACT_NOTIFY_TO secret missing',
    );
    return false;
  }

  try {
    await sender.send(notificationFor(submission, recipient, receivedAt));
    return true;
  } catch (error) {
    /* A mailer error may quote the Reply-To; /privacy promises no message data in logs. */
    console.error(
      'contact: notification not sent:',
      errorMessage(error).replaceAll(submission.email, '[sender]'),
    );
    return false;
  }
};

/**
 * Records that a message's notification went out. A failure here only means
 * the daily resend emails it a second time, so it is logged, not raised.
 */
export const markNotified = async (
  database: D1Database,
  id: string,
  now: number,
): Promise<void> => {
  try {
    await database
      .prepare('UPDATE messages SET notified_at = ? WHERE id = ?')
      .bind(now, id)
      .run();
  } catch (error) {
    console.error('contact: notification not recorded:', errorMessage(error));
  }
};

/** Counts a failed resend toward MAX_RESEND_ATTEMPTS; logged, not raised. */
export const recordFailedAttempt = async (
  database: D1Database,
  id: string,
): Promise<void> => {
  try {
    await database
      .prepare(
        'UPDATE messages SET notify_attempts = notify_attempts + 1 WHERE id = ?',
      )
      .bind(id)
      .run();
  } catch (error) {
    console.error('contact: failed attempt not recorded:', errorMessage(error));
  }
};
