import { createHash } from 'node:crypto';

interface SpamCheckInput {
  senderId: string;
  content: string;
  recipientCount: number;
  now?: number;
}

interface SpamCheckResult {
  allowed: boolean;
  code?: string;
  message?: string;
  retryAfterMs?: number;
}

interface SenderWindow {
  timestamps: number[];
}

interface DuplicateWindow {
  timestamps: number[];
}

class AntiSpamService {
  private readonly senderWindows = new Map<string, SenderWindow>();
  private readonly duplicateWindows = new Map<string, DuplicateWindow>();

  private readonly windowMs = Number(process.env.RELAY_SPAM_WINDOW_MS || 60_000);
  private readonly maxMessagesPerWindow = Number(process.env.RELAY_SPAM_MAX_MESSAGES || 90);
  private readonly maxDuplicatePerWindow = Number(process.env.RELAY_SPAM_MAX_DUPLICATE || 12);
  private readonly maxRecipientFanout = Number(process.env.RELAY_SPAM_MAX_FANOUT || 500);
  private readonly maxPayloadLength = Number(process.env.RELAY_SPAM_MAX_PAYLOAD_LENGTH || 64_000);

  private cleanupTimestamps(timestamps: number[], now: number): number[] {
    return timestamps.filter((ts) => ts > now - this.windowMs);
  }

  private fingerprint(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  checkMessage(input: SpamCheckInput): SpamCheckResult {
    const now = input.now ?? Date.now();
    const senderId = input.senderId;
    const recipientCount = input.recipientCount;

    if (!senderId) {
      return { allowed: false, code: 'spam_invalid_sender', message: 'Invalid sender' };
    }

    if (recipientCount <= 0 || recipientCount > this.maxRecipientFanout) {
      return {
        allowed: false,
        code: 'spam_fanout_limit',
        message: 'Recipient fan-out exceeds policy',
      };
    }

    if (!input.content || input.content.length > this.maxPayloadLength) {
      return {
        allowed: false,
        code: 'spam_payload_limit',
        message: 'Payload size exceeds policy',
      };
    }

    const senderWindow = this.senderWindows.get(senderId) || { timestamps: [] };
    senderWindow.timestamps = this.cleanupTimestamps(senderWindow.timestamps, now);
    if (senderWindow.timestamps.length >= this.maxMessagesPerWindow) {
      const oldest = senderWindow.timestamps[0] || now;
      return {
        allowed: false,
        code: 'spam_rate_limit',
        message: 'Message rate limit exceeded',
        retryAfterMs: Math.max(0, oldest + this.windowMs - now),
      };
    }

    const duplicateKey = `${senderId}:${this.fingerprint(input.content)}`;
    const duplicateWindow = this.duplicateWindows.get(duplicateKey) || { timestamps: [] };
    duplicateWindow.timestamps = this.cleanupTimestamps(duplicateWindow.timestamps, now);
    if (duplicateWindow.timestamps.length >= this.maxDuplicatePerWindow) {
      const oldest = duplicateWindow.timestamps[0] || now;
      return {
        allowed: false,
        code: 'spam_duplicate_limit',
        message: 'Duplicate content flood detected',
        retryAfterMs: Math.max(0, oldest + this.windowMs - now),
      };
    }

    senderWindow.timestamps.push(now);
    duplicateWindow.timestamps.push(now);
    this.senderWindows.set(senderId, senderWindow);
    this.duplicateWindows.set(duplicateKey, duplicateWindow);

    return { allowed: true };
  }

  cleanup(now = Date.now()): { senderWindows: number; duplicateWindows: number } {
    let removedSender = 0;
    for (const [key, window] of this.senderWindows.entries()) {
      window.timestamps = this.cleanupTimestamps(window.timestamps, now);
      if (window.timestamps.length === 0) {
        this.senderWindows.delete(key);
        removedSender += 1;
      } else {
        this.senderWindows.set(key, window);
      }
    }

    let removedDuplicate = 0;
    for (const [key, window] of this.duplicateWindows.entries()) {
      window.timestamps = this.cleanupTimestamps(window.timestamps, now);
      if (window.timestamps.length === 0) {
        this.duplicateWindows.delete(key);
        removedDuplicate += 1;
      } else {
        this.duplicateWindows.set(key, window);
      }
    }

    return { senderWindows: removedSender, duplicateWindows: removedDuplicate };
  }

  getStats(): {
    senderWindows: number;
    duplicateWindows: number;
    windowMs: number;
    maxMessagesPerWindow: number;
    maxDuplicatePerWindow: number;
    maxRecipientFanout: number;
    maxPayloadLength: number;
  } {
    return {
      senderWindows: this.senderWindows.size,
      duplicateWindows: this.duplicateWindows.size,
      windowMs: this.windowMs,
      maxMessagesPerWindow: this.maxMessagesPerWindow,
      maxDuplicatePerWindow: this.maxDuplicatePerWindow,
      maxRecipientFanout: this.maxRecipientFanout,
      maxPayloadLength: this.maxPayloadLength,
    };
  }
}

export const antiSpamService = new AntiSpamService();

