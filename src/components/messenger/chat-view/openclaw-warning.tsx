'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { useAppStore } from '@/store/use-app-store';
import { ModerationResult } from '@/types';
import { getRiskColorClasses, getRiskLevelKey, getCategoryKey } from '@/lib/openclaw';

interface OpenClawWarningProps {
  messageId: string;
  result: ModerationResult;
}

export function OpenClawWarning({ messageId, result }: OpenClawWarningProps) {
  const { t } = useT();
  const [dismissed, setDismissed] = useState(false);
  const clearModerationResult = useAppStore((s) => s.clearModerationResult);

  if (dismissed || result.isSafe || result.riskLevel === 'none') return null;

  const colors = getRiskColorClasses(result.riskLevel);
  const riskKey = getRiskLevelKey(result.riskLevel);

  const handleDismiss = () => {
    setDismissed(true);
    clearModerationResult(messageId);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0, y: -4 }}
        animate={{ opacity: 1, height: 'auto', y: 0 }}
        exit={{ opacity: 0, height: 0, y: -4 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="overflow-hidden"
      >
        <div
          className={cn(
            'mt-1.5 flex items-start gap-2.5 rounded-xl border px-3 py-2.5',
            colors.bg,
            colors.border,
            colors.animate
          )}
        >
          <ShieldAlert
            className={cn('size-4 shrink-0 mt-0.5', colors.text)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('text-xs font-semibold', colors.text)}>
                {t(riskKey as unknown as never)}
              </span>
              {result.categories.length > 0 && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium',
                    colors.badge
                  )}
                >
                  {result.categories
                    .map((cat) => t(getCategoryKey(cat) as unknown as never))
                    .join(' · ')}
                </span>
              )}
            </div>
            {result.warning && (
              <p className={cn('text-xs leading-relaxed', colors.text, 'opacity-90')}>
                {result.warning}
              </p>
            )}
            {result.suggestedAction && (
              <p className={cn('text-[11px] mt-1 leading-relaxed', colors.text, 'opacity-75')}>
                → {result.suggestedAction}
              </p>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className={cn(
              'shrink-0 size-5 flex items-center justify-center rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10',
              colors.text,
              'opacity-60 hover:opacity-100'
            )}
            aria-label={t('openclaw.dismiss')}
          >
            <X className="size-3" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
