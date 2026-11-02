import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestHarness, type TestHarness } from 'wrangler';
import { expect, test } from './test';
import { NOTIFY_TO } from '../playwright.worker.config';
import { RESEND_AFTER_MS } from '../src/lib/contact-resend';
import { retentionCutoff } from '../src/lib/contact-retention';
import { DAY_MS } from '../src/lib/time';
import type { D1Database } from '../src/lib/contact-env';

/**
 * src/worker.ts as built, run in workerd with chosen bindings, so a sweep can
 * fail and a binding can be missing; the preview server always has them all.
 */

const SERVER_DIR = 'dist/server';

interface BuiltConfig {
  name: string;
  main: string;
  compatibility_date: string;
  compatibility_flags: string[];
  rules: { type: string; globs: string[] }[];
  no_bundle: boolean;
  triggers: { crons: string[] };
  d1_databases: {
    binding: string;
    database_name: string;
    database_id: string;
    migrations_dir: string;
  }[];
  send_email: { name: string; allowed_sender_addresses?: string[] }[];
}

const built = (): BuiltConfig =>
  JSON.parse(readFileSync(join(SERVER_DIR, 'wrangler.json'), 'utf8'));

/** The built Worker with no bindings; the adapter's ASSETS comes from `assets`, left out. */
const bare = (config: BuiltConfig) => ({
  name: config.name,
  main: config.main,
  compatibility_date: config.compatibility_date,
  compatibility_flags: config.compatibility_flags,
  rules: config.rules,
  no_bundle: config.no_bundle,
});

/* Each harness keeps D1 in memory; a test id keeps it apart from the preview server's. */
const TEST_DATABASE_ID = 'worker-failures';

const withDatabase = (config: BuiltConfig) =>
  config.d1_databases.map((database) => ({
    ...database,
    database_id: TEST_DATABASE_ID,
  }));

const withMailer = (config: BuiltConfig) => ({
  send_email: config.send_email,
  vars: { CONTACT_NOTIFY_TO: NOTIFY_TO },
});

const SWEEP_BLOCKED = 'sweep blocked';

const harnesses: TestHarness[] = [];

const start = async (config: object): Promise<TestHarness> => {
  const server = createTestHarness({
    root: SERVER_DIR,
    workers: [{ config }],
  });
  harnesses.push(server);
  await server.listen();
  return server;
};

test.afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((server) => server.close()));
});

const runCron = (server: TestHarness, config: BuiltConfig) => {
  const cron = config.triggers.crons[0];
  if (!cron) throw new Error('wrangler.jsonc declares no cron trigger.');
  return server.getWorker().scheduled({ cron });
};

const messages = (server: TestHarness) =>
  server.getWorker<{ MESSAGES_DB: D1Database }>().getEnv();

test.describe('the scheduled job when the sweep fails', () => {
  test('still resends once, and the run fails', async () => {
    const config = built();
    const server = await start({
      ...bare(config),
      d1_databases: withDatabase(config),
      ...withMailer(config),
    });
    const worker = server.getWorker();
    await worker.applyD1Migrations('MESSAGES_DB');
    const { MESSAGES_DB } = await messages(server);

    const now = Date.now();
    const insert = MESSAGES_DB.prepare(
      'INSERT INTO messages (id, name, email, body, created_at) VALUES (?, ?, ?, ?, ?)',
    );
    await insert
      .bind(
        'expired',
        'Old',
        'old@example.com',
        'expired',
        retentionCutoff(now) - DAY_MS,
      )
      .run();
    await insert
      .bind(
        'unsent',
        'New',
        'new@example.com',
        'unsent',
        now - 2 * RESEND_AFTER_MS,
      )
      .run();
    await MESSAGES_DB.prepare(
      'CREATE TRIGGER block_sweep BEFORE DELETE ON messages ' +
        `BEGIN SELECT RAISE(ABORT, '${SWEEP_BLOCKED}'); END`,
    ).run();

    const { outcome } = await runCron(server, config);

    expect(
      outcome,
      'a failed sweep was swallowed, so the cron run reports success and nobody is alerted.',
    ).toBe('exception');
    const logs = server.getLogs().map(({ message }) => message);
    expect(
      logs.filter((line) => line.includes(SWEEP_BLOCKED)),
      'the sweep failure was not logged.',
    ).toHaveLength(1);
    expect(
      logs.filter((line) => line.startsWith('notification resend:')),
      'a failed sweep should not stop the resend, nor run it twice.',
    ).toEqual(['notification resend: sent 1 of 1 unsent notifications']);

    const { results } = await MESSAGES_DB.prepare(
      'SELECT id FROM messages WHERE notified_at IS NOT NULL',
    ).all<{ id: string }>();
    expect(
      results.map(({ id }) => id),
      'the resent notification was not marked sent.',
    ).toEqual(['unsent']);
  });
});

test.describe('a missing binding fails the request or run', () => {
  test('without MESSAGES_DB the cron run fails before any resend', async () => {
    const config = built();
    const server = await start({ ...bare(config), ...withMailer(config) });

    const { outcome } = await runCron(server, config);

    expect(
      outcome,
      'the cron run succeeded with no database, so the retention /privacy promises silently stopped.',
    ).toBe('exception');
    expect(
      server.getLogs().map(({ message }) => message),
      'the run went past the missing database.',
    ).not.toContainEqual(
      expect.stringMatching(/^(retention sweep|notification resend)\b/),
    );
  });

  test('without ASSETS a /videos/ request fails naming the binding', async () => {
    const server = await start(bare(built()));

    const response = await server.getWorker().fetch('/videos/missing.webm');

    expect(
      response.status,
      'a video was answered with no assets to read.',
    ).toBe(500);
    expect(
      await response.text(),
      'the error does not say which binding is missing.',
    ).toContain('ASSETS binding missing');
  });
});
