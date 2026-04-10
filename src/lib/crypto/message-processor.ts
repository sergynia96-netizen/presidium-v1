/**
 * E2E Message Processor
 *
 * Handles the complete message encryption/decryption pipeline:
 * 1. Outgoing: plaintext → OpenClaw moderation → encrypt → relay
 * 2. Incoming: relay → decrypt → OpenClaw moderation → plaintext
 *
 * Features:
 * - Message queue for offline/outbox
 * - Retry logic with exponential backoff
 * - OpenClaw moderation hooks (pre-encrypt + post-decrypt)
 * - Message status tracking (pending → sent → delivered → read)
 * - Batch processing for group messages
 * - Error handling and recovery
 */

import { sessionManager } from './session-manager';
import { encryptMessage, decryptMessage, type EncryptedEnvelope } from './encrypt';
import { saveMessage, type StoredMessage } from './store';
import { generateUUID, encodeText, decodeText } from './utils';
import { relayClient } from './relay-client';

// ─── Types ───────────────────────────────────────────────────────────────────

export type MessageDirection = 'outgoing' | 'incoming';
export type MessageStatus = 'pending' | 'encrypting' | 'moderating' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'blocked' | 'decrypting';

export interface ProcessedMessage {
  id: string;
  chatId: string;
  senderId: string;
  recipientId: string;
  direction: MessageDirection;
  status: MessageStatus;
  timestamp: number;

  // Content
  plaintext?: string;
  encrypted?: EncryptedEnvelope;
  storedMessage?: StoredMessage;

  // Moderation
  moderationResult?: ModerationResult;

  // Error
  error?: string;
  retryCount: number;
  nextRetryAt?: number;
}

export interface ModerationResult {
  isSafe: boolean;
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  categories: string[];
  warning?: string;
  suggestedAction?: 'allow' | 'warn' | 'block' | 'report';
}

export interface MessageProcessorOptions {
  chatId: string;
  skipEncryption?: boolean; // For testing
  priority?: 'high' | 'normal' | 'low';
}

// ─── Message Queue ───────────────────────────────────────────────────────────

class MessageQueue {
  private queue: ProcessedMessage[] = [];
  private processing = false;
  private maxRetries = 3;
  private baseDelayMs = 1000;

  /**
   * Add a message to the processing queue.
   */
  enqueue(message: ProcessedMessage): void {
    this.queue.push(message);
    if (!this.processing) {
      this.process();
    }
  }

  /**
   * Process messages in the queue sequentially.
   */
  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const message = this.queue[0];

      // Check if message is ready for processing
      if (message.nextRetryAt && Date.now() < message.nextRetryAt) {
        // Not yet time to retry, move to back of queue
        this.queue.push(this.queue.shift()!);
        // Check if any other message is ready
        const readyIndex = this.queue.findIndex(m => !m.nextRetryAt || Date.now() >= m.nextRetryAt);
        if (readyIndex === -1) {
          // No messages ready, wait
          await this.wait(100);
          continue;
        }
        // Move ready message to front
        const ready = this.queue.splice(readyIndex, 1)[0];
        this.queue.unshift(ready);
        continue;
      }

      // Process the message
      try {
        await this.processMessage(message);
        this.queue.shift(); // Remove from queue
      } catch (error) {
        // Retry logic
        message.retryCount++;
        if (message.retryCount >= this.maxRetries) {
          message.status = 'failed';
          message.error = error instanceof Error ? error.message : String(error);
          this.queue.shift();
          console.error(`[E2E MessageProcessor] Message ${message.id} failed after ${message.retryCount} retries:`, message.error);
        } else {
          // Exponential backoff
          const delay = this.baseDelayMs * Math.pow(2, message.retryCount - 1);
          message.nextRetryAt = Date.now() + delay;
          message.status = 'pending';
          // Move to back of queue
          this.queue.push(this.queue.shift()!);
        }
      }
    }

    this.processing = false;
  }

  /**
   * Process a single message through the pipeline.
   */
  private async processMessage(message: ProcessedMessage): Promise<void> {
    if (message.direction === 'outgoing') {
      await this.processOutgoing(message);
    } else {
      await this.processIncoming(message);
    }
  }

  /**
   * Process an outgoing message (encrypt and send).
   */
  private async processOutgoing(message: ProcessedMessage): Promise<void> {
    if (!message.plaintext) {
      throw new Error('Outgoing message has no plaintext content');
    }

    // Step 1: Moderation (pre-encryption)
    if (!message.moderationResult) {
      message.status = 'moderating';
      message.moderationResult = await this.moderateMessage(message.plaintext, message.direction);

      if (message.moderationResult.suggestedAction === 'block') {
        message.status = 'blocked';
        message.error = message.moderationResult.warning || 'Message blocked by moderation';
        return;
      }
    }

    // Step 2: Encryption
    message.status = 'encrypting';
    const identityKeys = sessionManager.getLocalIdentityKeys();
    if (!identityKeys) {
      throw new Error('Identity keys not available');
    }

    const envelope = await encryptMessage(
      identityKeys,
      message.senderId,
      message.recipientId,
      encodeText(message.plaintext),
    );

    message.encrypted = envelope;
    message.status = 'sending';

    // Step 3: Save to IndexedDB
    const storedMessage: StoredMessage = {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      recipientId: message.recipientId,
      encrypted: JSON.stringify(envelope),
      timestamp: message.timestamp,
      status: 'pending',
      direction: 'outgoing',
    };

    await saveMessage(storedMessage);
    message.storedMessage = storedMessage;
    message.status = 'sent';

    // Step 4: Send via relay
    await relayClient.sendEncryptedMessage(envelope);

    // Step 5: Record success
    await sessionManager.recordSuccess(message.recipientId);
  }

  /**
   * Process an incoming message (decrypt and moderate).
   */
  private async processIncoming(message: ProcessedMessage): Promise<void> {
    if (!message.encrypted) {
      throw new Error('Incoming message has no encrypted content');
    }

    // Step 1: Decryption
    message.status = 'decrypting';
    const identityKeys = sessionManager.getLocalIdentityKeys();
    const preKeys = sessionManager.getLocalPreKeys();

    if (!identityKeys || !preKeys) {
      throw new Error('Local keys not available');
    }

    const decrypted = await decryptMessage(
      identityKeys,
      preKeys,
      message.recipientId,
      message.encrypted,
    );

    message.plaintext = decodeText(decrypted.plaintext);

    // Step 2: Moderation (post-decryption)
    if (message.plaintext) {
      message.status = 'moderating';
      message.moderationResult = await this.moderateMessage(message.plaintext, message.direction);
    }

    // Step 3: Save to IndexedDB
    const storedMessage: StoredMessage = {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      recipientId: message.recipientId,
      encrypted: JSON.stringify(message.encrypted),
      timestamp: message.timestamp,
      status: 'delivered',
      direction: 'incoming',
    };

    await saveMessage(storedMessage);
    message.storedMessage = storedMessage;
    message.status = 'delivered';

    // Step 4: Record success
    await sessionManager.recordSuccess(message.senderId);
  }

  /**
   * Moderate a message using OpenClaw.
   */
  private async moderateMessage(
    content: string,
    direction: MessageDirection,
  ): Promise<ModerationResult> {
    const normalized = content.trim().toLowerCase();
    if (!normalized) {
      return {
        isSafe: true,
        riskLevel: 'safe',
        categories: [],
        suggestedAction: 'allow',
      };
    }

    const criticalPatterns: Record<string, RegExp[]> = {
      extremism: [/\bэкстрем(?:изм|ист|истск)\w*\b/i, /\bextremis\w*\b/i],
      terrorism: [/\bтеррор(?:изм|ист|истск)\w*\b/i, /\bterroris\w*\b/i],
      fascism: [/\bфаш(?:изм|ист)\w*\b/i, /\bfascis\w*\b/i],
      drug_business: [/\bнарко(?:бизнес|трафик|сбыт)\w*\b/i, /\bdrug\s*(trade|dealing|traffic)\b/i],
      violence: [/\bубийств\w*\b/i, /\bнасили\w*\b/i, /\bkill(?:ing)?\b/i, /\bviolence\b/i],
      pornography: [/\bпорн\w*\b/i, /\bchild\s*porn\w*\b/i, /\bpornograph\w*\b/i],
      fraud: [/\bмошенн\w*\b/i, /\bscam\b/i, /\bfraud\b/i],
      banditism: [/\bбандит\w*\b/i],
      murder: [/\bубить\b/i, /\bmurder\b/i],
      criminal_activity: [/\bпреступ\w*\b/i, /\bcriminal\b/i],
    };

    const hitCategories = Object.entries(criticalPatterns)
      .filter(([, patterns]) => patterns.some((pattern) => pattern.test(normalized)))
      .map(([category]) => category);

    if (hitCategories.length > 0) {
      return {
        isSafe: false,
        riskLevel: 'critical',
        categories: hitCategories,
        warning: 'OpenClaw blocked risky content',
        suggestedAction: 'block',
      };
    }

    if (typeof fetch !== 'function') {
      return {
        isSafe: false,
        riskLevel: 'high',
        categories: ['moderation_unavailable'],
        warning: 'Moderation service unavailable',
        suggestedAction: 'block',
      };
    }

    try {
      const response = await fetch('/api/openclaw/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: content,
          messageId: generateUUID(),
          context: direction,
        }),
      });

      if (!response.ok) {
        return {
          isSafe: false,
          riskLevel: 'high',
          categories: ['moderation_http_error'],
          warning: 'Moderation request failed',
          suggestedAction: 'block',
        };
      }

      type OpenClawModerationResponse = {
        isSafe?: boolean;
        riskLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical' | 'safe';
        categories?: string[];
        warning?: string | null;
        suggestedAction?: 'allow' | 'warn' | 'block' | 'report' | null;
      };

      const payload = (await response.json()) as OpenClawModerationResponse;
      const riskLevel = payload.riskLevel === 'none' ? 'safe' : (payload.riskLevel || 'safe');

      return {
        isSafe: Boolean(payload.isSafe),
        riskLevel,
        categories: Array.isArray(payload.categories) ? payload.categories : [],
        warning: payload.warning || undefined,
        suggestedAction: payload.suggestedAction || (payload.isSafe ? 'allow' : 'block'),
      };
    } catch {
      return {
        isSafe: false,
        riskLevel: 'high',
        categories: ['moderation_unavailable'],
        warning: 'Moderation service unavailable',
        suggestedAction: 'block',
      };
    }
  }

  /**
   * Wait for a specified number of milliseconds.
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get the current queue status.
   */
  getQueueStatus(): {
    pending: number;
    processing: boolean;
    messages: ProcessedMessage[];
  } {
    return {
      pending: this.queue.length,
      processing: this.processing,
      messages: [...this.queue],
    };
  }

  /**
   * Clear the queue.
   */
  clear(): void {
    this.queue = [];
    this.processing = false;
  }
}

// ─── Message Processor ───────────────────────────────────────────────────────

class MessageProcessor {
  private queue = new MessageQueue();

  /**
   * Process an outgoing message.
   * Returns immediately with a ProcessedMessage object.
   * Actual processing happens asynchronously.
   */
  async processOutgoing(
    options: MessageProcessorOptions & {
      plaintext: string;
      senderId: string;
      recipientId: string;
    },
  ): Promise<ProcessedMessage> {
    // Ensure session exists
    await sessionManager.getOrCreateSession(options.recipientId);

    const message: ProcessedMessage = {
      id: generateUUID(),
      chatId: options.chatId,
      senderId: options.senderId,
      recipientId: options.recipientId,
      direction: 'outgoing',
      status: 'pending',
      timestamp: Date.now(),
      plaintext: options.plaintext,
      retryCount: 0,
    };

    this.queue.enqueue(message);
    return message;
  }

  /**
   * Process an incoming encrypted message.
   */
  async processIncoming(
    options: {
      chatId: string;
      senderId: string;
      recipientId: string;
      envelope: EncryptedEnvelope;
    },
  ): Promise<ProcessedMessage> {
    // Ensure session exists (establish if first message)
    const identityKeys = sessionManager.getLocalIdentityKeys();
    const preKeys = sessionManager.getLocalPreKeys();

    if (identityKeys && preKeys) {
      try {
        await sessionManager.establishResponderSession(
          options.senderId,
          options.envelope.x3dhInitiate!,
        );
      } catch {
        // Session may already exist, ignore
      }
    }

    const message: ProcessedMessage = {
      id: options.envelope.messageId,
      chatId: options.chatId,
      senderId: options.senderId,
      recipientId: options.recipientId,
      direction: 'incoming',
      status: 'pending',
      timestamp: options.envelope.timestamp,
      encrypted: options.envelope,
      retryCount: 0,
    };

    this.queue.enqueue(message);
    return message;
  }

  /**
   * Get queue status.
   */
  getQueueStatus() {
    return this.queue.getQueueStatus();
  }

  /**
   * Clear the processing queue.
   */
  clearQueue(): void {
    this.queue.clear();
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const messageProcessor = new MessageProcessor();
