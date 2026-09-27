/*
 * Typed structurally rather than adding @cloudflare/workers-types. All
 * optional: a missing binding is an unfinished deploy, reported as a failure.
 */

/** `changes`: rows written or removed by the statement. */
interface D1RunResult {
  meta: { changes: number };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<D1RunResult>;
  all<Row>(): Promise<{ results: Row[] }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface EmailAddress {
  email: string;
  name?: string;
}

/** The subset of the send_email builder API the notification uses. */
export interface EmailMessageBuilder {
  to: string;
  from: EmailAddress;
  replyTo: string;
  subject: string;
  text: string;
}

interface SendEmail {
  send(message: EmailMessageBuilder): Promise<{ messageId: string }>;
}

export interface ContactEnv {
  MESSAGES_DB?: D1Database;
  CONTACT_RATE_LIMIT?: RateLimiter;
  CONTACT_MAILER?: SendEmail;
  /* Secret. Must be a verified Email Routing destination address. */
  CONTACT_NOTIFY_TO?: string;
}
