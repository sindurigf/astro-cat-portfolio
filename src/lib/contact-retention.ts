import { DAY_MS } from './time';
import type { D1Database } from './contact-env';
import { RETENTION_DAYS } from './contact-form';

/** Unix milliseconds. */
export const retentionCutoff = (now: number): number =>
  now - RETENTION_DAYS * DAY_MS;

/* Logs every run, zero included: a stopped sweep must not look idle. */
export const deleteExpiredMessages = async (
  database: D1Database,
  now: number,
): Promise<number> => {
  const { meta } = await database
    .prepare('DELETE FROM messages WHERE created_at < ?')
    .bind(retentionCutoff(now))
    .run();

  console.log(
    `retention sweep: deleted ${meta.changes} of the messages older than ` +
      `${RETENTION_DAYS} days`,
  );
  return meta.changes;
};
