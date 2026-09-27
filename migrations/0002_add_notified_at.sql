-- When the notification email for a message went out, in Unix milliseconds.
-- NULL means it has not: the daily cron resends those, and check:live counts
-- them.
ALTER TABLE messages ADD COLUMN notified_at INTEGER;

-- Rows stored before this column existed are assumed emailed. Leaving them
-- NULL would resend every message still inside retention on the first run.
UPDATE messages SET notified_at = created_at WHERE notified_at IS NULL;

CREATE INDEX IF NOT EXISTS messages_awaiting_notification
  ON messages (created_at) WHERE notified_at IS NULL;
