/**
 * EncryptionStatusBadge
 *
 * Shows the encryption status of the current chat in the chat header.
 * Similar to Signal's lock icon and WhatsApp's encryption notice.
 *
 * States:
 * - Verified (green lock): Safety number verified
 * - Encrypted (gray lock): E2E encrypted but not verified
 * - Not encrypted (no lock): No E2E session
 * - Error (red warning): Session failed
 */

'use client';

import React from 'react';
import { Lock, LockOpen, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';

export type EncryptionStatus = 'verified' | 'encrypted' | 'not-encrypted' | 'error' | 'initializing';

interface EncryptionStatusBadgeProps {
  status: EncryptionStatus;
  onClick?: () => void;
  className?: string;
}

const STATUS_CONFIG: Record<EncryptionStatus, {
  icon: React.ReactNode;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  verified: {
    icon: <ShieldCheck className="w-3.5 h-3.5" />,
    label: 'Зашифровано и проверено',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/50',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
  },
  encrypted: {
    icon: <Lock className="w-3.5 h-3.5" />,
    label: 'Зашифровано',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-50 dark:bg-gray-900/50',
    borderColor: 'border-gray-200 dark:border-gray-700',
  },
  'not-encrypted': {
    icon: <LockOpen className="w-3.5 h-3.5" />,
    label: 'Не зашифровано',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/50',
    borderColor: 'border-amber-200 dark:border-amber-800',
  },
  error: {
    icon: <ShieldAlert className="w-3.5 h-3.5" />,
    label: 'Ошибка шифрования',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/50',
    borderColor: 'border-red-200 dark:border-red-800',
  },
  initializing: {
    icon: <Shield className="w-3.5 h-3.5 animate-pulse" />,
    label: 'Инициализация...',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/50',
    borderColor: 'border-blue-200 dark:border-blue-800',
  },
};

export function EncryptionStatusBadge({
  status,
  onClick,
  className = '',
}: EncryptionStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const interactive = typeof onClick === 'function';

  return (
    <span
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`
        inline-flex items-center gap-1.5 px-2 py-1 rounded-full
        text-xs font-medium transition-all duration-200
        border ${config.bgColor} ${config.color} ${config.borderColor}
        ${interactive ? 'hover:opacity-80 cursor-pointer' : ''}
        ${className}
      `}
      title={config.label}
    >
      {config.icon}
      <span className="hidden sm:inline">{config.label}</span>
    </span>
  );
}

/**
 * EncryptionNotice
 *
 * System notice shown at the top of a chat, like Signal's
 * "Messages are end-to-end encrypted..."
 */
interface EncryptionNoticeProps {
  recipientName: string;
  isVerified: boolean;
  onVerify?: () => void;
}

export function EncryptionNotice({
  recipientName,
  isVerified,
  onVerify,
}: EncryptionNoticeProps) {
  return (
    <div className="flex flex-col items-center px-8 py-4 my-2">
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 text-center max-w-sm">
        <Lock className="w-3.5 h-3.5 flex-shrink-0" />
        <span>
          Сообщения в этом чате{' '}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            сквозным образом зашифрованы
          </span>
          . Никто, кроме вас и{' '}
          <span className="font-medium">{recipientName}</span>, не может их прочитать.
        </span>
      </div>
      {!isVerified && onVerify && (
        <button
          onClick={onVerify}
          className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          Проверить номер безопасности
        </button>
      )}
    </div>
  );
}
