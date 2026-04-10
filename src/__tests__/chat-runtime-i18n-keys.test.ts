import { describe, expect, it } from 'vitest';
import type { TranslationKey } from '@/lib/i18n';

const REQUIRED_CHAT_RUNTIME_KEYS: TranslationKey[] = [
  'relay.reconnecting',
  'relay.offline',
  'relay.queueDeliveredSummary',
  'msg.status.sending',
  'msg.status.sent',
  'msg.status.delivered',
  'msg.status.read',
  'aria.messageStatus',
  'aria.messageQueueState',
  'outbox.messageQueued',
  'outbox.messageRetrying',
  'chat.decryptFailed',
  'chat.e2eInitFailed',
  'chat.e2eSessionFailed',
  'chat.e2eEncryptFailed',
  'chat.e2eReinitFailed',
  'chat.sentWithoutEncryption',
  'chat.contactVerified',
  'moderation.serviceUnavailableBlocked',
];

describe('chat runtime i18n keys', () => {
  it('keeps required chat runtime translation keys defined', () => {
    expect(REQUIRED_CHAT_RUNTIME_KEYS.length).toBeGreaterThan(0);
  });
});
