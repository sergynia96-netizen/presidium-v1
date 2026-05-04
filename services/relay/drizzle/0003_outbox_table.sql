-- Migration: Add outbox table for reliable message delivery
-- This table backs the OutboxRepository contract from @presidium/shared-messaging

CREATE TABLE IF NOT EXISTS outbox (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to the message being tracked
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,

  -- Recipient of this delivery attempt
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Current lifecycle status (matches OutboxStatus from domain contract)
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'failed', 'cancelled')),

  -- Retry tracking (matches OutboxEntry + RetryPolicy from domain)
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,

  -- Timing fields
  enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_attempt_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Error tracking
  last_error TEXT,

  -- Optimistic locking version (required by Repository pattern)
  version INTEGER NOT NULL DEFAULT 1,

  -- Audit timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns

-- 1. Poll pending/due items for delivery worker
CREATE INDEX idx_outbox_status_next_attempt
  ON outbox(status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

-- 2. Look up outbox entries by message
CREATE INDEX idx_outbox_message_id
  ON outbox(message_id);

-- 3. Look up outbox entries by recipient
CREATE INDEX idx_outbox_recipient_id
  ON outbox(recipient_id);

-- 4. Track updated ordering
CREATE INDEX idx_outbox_updated_at
  ON outbox(updated_at);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
 $$ LANGUAGE plpgsql;

CREATE TRIGGER update_outbox_updated_at
  BEFORE UPDATE ON outbox
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE outbox IS 'Message outbox for reliable delivery with retry logic. Backs OutboxRepository contract.';
