-- Fix outbox status CHECK constraint to include 'retrying'
-- Domain OutboxStatus allows: pending, sending, sent, delivered, failed, retrying, cancelled
-- Previous migration was missing 'retrying'

ALTER TABLE outbox DROP CONSTRAINT IF EXISTS outbox_status_check;

ALTER TABLE outbox ADD CONSTRAINT outbox_status_check
  CHECK (status IN (
    'pending', 
    'sending', 
    'sent', 
    'delivered', 
    'failed', 
    'retrying',
    'cancelled'
  ));

COMMENT ON CONSTRAINT outbox_status_check ON outbox IS 
  'Must match OutboxStatus union from @presidium/shared-messaging';
