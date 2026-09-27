-- Contact form submissions. Apply with DEPLOYMENT.md's D1 command.
-- `created_at` is Unix milliseconds, as Date.now() returns.
CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Retention is by age, and deletion reads this. Without it the sweep is a
-- full scan of a table that only ever grows.
CREATE INDEX IF NOT EXISTS messages_by_age ON messages (created_at);
