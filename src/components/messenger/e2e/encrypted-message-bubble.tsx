/**
 * EncryptedMessageBubble
 *
 * Wraps a message bubble with encryption indicator.
 * Shows:
 * - Lock icon for encrypted messages
 * - Warning icon for messages that failed moderation
 * - Timestamp and delivery status
 * - "Edited" indicator
 * - Safety number change warning
 */

'use client';

import React from 'react';
import { Lock, AlertTriangle, Clock, Check, CheckCheck } from 'lucide-react';

export type MessageDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

interface EncryptedMessageBubbleProps {
  children: React.ReactNode;
  isEncrypted: boolean;
  isEdited?: boolean;
  isModerationWarning?: boolean;
  moderationWarning?: string;
  deliveryStatus: MessageDeliveryStatus;
  timestamp: string;
  isOwn: boolean;
  className?: string;
}

export function EncryptedMessageBubble({
  children,
  isEncrypted,
  isEdited,
  isModerationWarning,
  moderationWarning,
  deliveryStatus,
  timestamp,
  isOwn,
  className = '',
}: EncryptedMessageBubbleProps) {
  return (
    <div className={`group relative ${className}`}>
      {/* Moderation Warning Banner */}
      {isModerationWarning && moderationWarning && (
        <div className="mb-1 flex items-center gap-1.5 px-2 py-1 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-md">
          <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-300">{moderationWarning}</span>
        </div>
      )}

      {/* Message Content */}
      <div className="relative">
        {children}

        {/* Encryption + Status Footer */}
        <div className="flex items-center justify-end gap-1 mt-1 px-1">
          {/* Encryption indicator */}
          {isEncrypted && (
            <Lock className="w-3 h-3 text-gray-400 dark:text-gray-500" />
          )}

          {/* Timestamp */}
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {timestamp}
          </span>

          {/* Edited indicator */}
          {isEdited && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">
              изм.
            </span>
          )}

          {/* Delivery status (own messages only) */}
          {isOwn && (
            <DeliveryStatusIndicator status={deliveryStatus} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Delivery status indicator (single check, double check, blue double check)
 */
function DeliveryStatusIndicator({ status }: { status: MessageDeliveryStatus }) {
  switch (status) {
    case 'sent':
      return <Check className="w-3.5 h-3.5 text-gray-400" />;
    case 'delivered':
      return <CheckCheck className="w-3.5 h-3.5 text-gray-400" />;
    case 'read':
      return <CheckCheck className="w-3.5 h-3.5 text-blue-500" />;
    case 'failed':
      return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-gray-400" />;
  }
}

/**
 * E2EInitializationBanner
 *
 * Shown during E2E initialization at the top of the chat.
 */
export function E2EInitializationBanner() {
  return (
    <div className="flex items-center justify-center gap-2 py-2 px-4 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900">
      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs text-blue-600 dark:text-blue-400">
        Инициализация сквозного шифрования...
      </span>
    </div>
  );
}

/**
 * E2EErrorBanner
 *
 * Shown when E2E encryption fails.
 */
interface E2EErrorBannerProps {
  onRetry?: () => void;
}

export function E2EErrorBanner({ onRetry }: E2EErrorBannerProps) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 px-4 bg-red-50 dark:bg-red-950/30 border-b border-red-100 dark:border-red-900">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <span className="text-xs text-red-600 dark:text-red-400">
          Ошибка шифрования. Сообщения могут быть небезопасны.
        </span>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium"
        >
          Повторить
        </button>
      )}
    </div>
  );
}
