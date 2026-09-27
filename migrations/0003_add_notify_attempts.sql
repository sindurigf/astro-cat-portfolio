-- Failed daily resends of a message's notification. The resend stops at
-- MAX_RESEND_ATTEMPTS in src/lib/contact-resend.ts; check:live still counts
-- the message as unsent.
ALTER TABLE messages ADD COLUMN notify_attempts INTEGER NOT NULL DEFAULT 0;
