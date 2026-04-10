'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Image,
  FileText,
  Mic,
  Trash2,
  ChevronRight,
  HardDrive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/use-app-store';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import {
  STORAGE_QUOTA_BYTES,
  bytesToMB,
  clearEstimatedCache,
  computeMessageBreakdownBytes,
  estimateLocalCacheBytes,
  formatStorageValue,
} from '@/lib/storage-usage';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.15 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

interface StorageCategory {
  key: string;
  bytes: number;
  icon: React.ElementType;
  color: string;
}

export default function StorageScreen() {
  const { goBack, messages } = useAppStore();
  const { t } = useT();

  const [cacheCleared, setCacheCleared] = useState(false);
  const [cacheBytes, setCacheBytes] = useState(() => estimateLocalCacheBytes());

  const breakdown = useMemo(() => computeMessageBreakdownBytes(messages), [messages]);

  const storageCategories: StorageCategory[] = useMemo(
    () => [
      { key: 'media', bytes: breakdown.media, icon: Image, color: 'text-blue-500' },
      { key: 'documents', bytes: breakdown.documents, icon: FileText, color: 'text-amber-500' },
      { key: 'voice', bytes: breakdown.voice, icon: Mic, color: 'text-emerald-500' },
      { key: 'cache', bytes: cacheBytes, icon: HardDrive, color: 'text-rose-500' },
    ],
    [breakdown.documents, breakdown.media, breakdown.voice, cacheBytes],
  );

  const usedBytes = storageCategories.reduce((sum, category) => sum + category.bytes, 0);
  const usedMB = bytesToMB(usedBytes);
  const totalMB = bytesToMB(STORAGE_QUOTA_BYTES);
  const freeMB = Math.max(0, totalMB - usedMB);
  const percentage = totalMB > 0 ? Math.round((usedMB / totalMB) * 100) : 0;

  const handleClearCache = async () => {
    await clearEstimatedCache();
    setCacheBytes(estimateLocalCacheBytes());
    setCacheCleared(true);
    setTimeout(() => setCacheCleared(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <Button variant="ghost" size="icon" className="size-9" onClick={goBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold">{t('storage.title')}</h1>
      </div>

      <ScrollArea className="flex-1">
        <motion.div
          variants={container as unknown as never}
          initial="hidden"
          animate="show"
          className="mx-auto max-w-2xl p-4 lg:p-6 space-y-5 pb-8"
        >
          {/* Circular progress visualization */}
          <motion.div variants={item as unknown as never} className="flex flex-col items-center pt-6 pb-4">
            <div className="relative flex items-center justify-center size-40">
              <svg className="size-full -rotate-90" viewBox="0 0 100 100">
                {/* Background circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-muted/30"
                />
                {/* Progress circle */}
                <motion.circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="url(#storageGradient)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${percentage * 2.64} ${264}`}
                  initial={{ strokeDasharray: '0 264' }}
                  animate={{ strokeDasharray: `${percentage * 2.64} ${264}` }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                />
                <defs>
                  <linearGradient id="storageGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold">{formatStorageValue(usedBytes)}</span>
                <span className="text-xs text-muted-foreground">{t('storage.used')}</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
              <span>{t('storage.total')}: {totalMB} MB</span>
              <Separator orientation="vertical" className="h-4" />
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                {t('storage.free')}: {freeMB} MB
              </span>
            </div>
          </motion.div>

          {/* Linear progress bar */}
          <motion.div variants={item as unknown as never} className="space-y-2">
            <Progress value={percentage} className="h-2" />
          </motion.div>

          <Separator />

          {/* Category breakdown */}
          <motion.div variants={item as unknown as never} className="space-y-1">
            {storageCategories.map((cat) => {
              const Icon = cat.icon;
              const catPercentage = totalMB > 0 ? Math.round((bytesToMB(cat.bytes) / totalMB) * 100) : 0;
              const labelKey = cat.key as 'media' | 'documents' | 'voice' | 'cache';
              const labelMap = {
                media: 'storage.media',
                documents: 'storage.documents',
                voice: 'storage.voice',
                cache: 'storage.cache',
              } as const;

              return (
                <button
                  type="button"
                  key={cat.key}
                  className="flex items-center gap-3 w-full py-3 px-1 text-left hover:bg-accent/30 rounded-lg transition-colors"
                >
                  <div className="flex items-center justify-center size-9 rounded-lg bg-muted/60 shrink-0">
                    <Icon className={cn('size-4', cat.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">{t(labelMap[labelKey])}</span>
                    <div className="mt-1 h-1 rounded-full bg-muted/40 overflow-hidden">
                      <motion.div
                        className={cn('h-full rounded-full', cat.key === 'cache' ? 'bg-rose-500/60' : 'bg-primary/40')}
                        initial={{ width: 0 }}
                        animate={{ width: `${catPercentage}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.5 }}
                      />
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground font-medium">
                    {formatStorageValue(cat.bytes)}
                  </span>
                  <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </motion.div>

          <Separator />

          {/* Clear cache */}
          <motion.div variants={item as unknown as never} className="pt-2">
            <Button
              variant={cacheCleared ? 'outline' : 'default'}
              className={cn(
                'w-full gap-2 transition-all',
                cacheCleared && 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              )}
              onClick={handleClearCache}
            >
              <Trash2 className="size-4" />
              {cacheCleared ? t('storage.cacheCleared') : t('storage.clearCache')}
            </Button>
          </motion.div>
        </motion.div>
      </ScrollArea>
    </div>
  );
}
