-- Migration: 0005_expand_messages_table.sql
-- Description: Add version, sender_device_id, direction, client_nonce columns to messages
-- Created: 2026-05-12

ALTER TABLE messages ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_device_id UUID REFERENCES users(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS direction VARCHAR(20) DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound'));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_nonce TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_sender_device ON messages(sender_device_id);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_sender_nonce_unique ON messages(sender_id, client_nonce) WHERE client_nonce IS NOT NULL;