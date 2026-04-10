'use client';

import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import { Sun, Moon, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n';

const options: Array<{
  value: 'light' | 'dark' | 'matrix';
  icon: React.ComponentType<{ className?: string }>;
  labelKey: TranslationKey;
}> = [
  { value: 'light', icon: Sun, labelKey: 'theme.light' },
  { value: 'dark', icon: Moon, labelKey: 'theme.dark' },
  { value: 'matrix', icon: Terminal, labelKey: 'theme.matrix' },
];

type ThemeValue = (typeof options)[number]['value'];

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { t } = useT();

  const currentValue: ThemeValue =
    theme === 'matrix'
      ? 'matrix'
      : theme === 'dark'
        ? 'dark'
        : theme === 'light'
          ? 'light'
          : resolvedTheme === 'dark'
            ? 'dark'
            : 'light';

  return (
    <div className="flex items-center gap-0.5 rounded-xl bg-muted/60 p-0.5">
      {options.map(({ value, icon: Icon, labelKey }) => {
        const isActive = currentValue === value;
        const isMatrixActive = isActive && value === 'matrix';

        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            className={cn(
              'relative flex items-center justify-center size-8 rounded-lg transition-colors',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title={t(labelKey)}
            aria-label={t(labelKey)}
          >
            {isActive && (
              <motion.div
                layoutId="theme-active"
                className={cn(
                  'absolute inset-0 rounded-lg shadow-sm',
                  isMatrixActive
                    ? 'bg-black border border-green-500/40'
                    : 'bg-background'
                )}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <Icon
              className={cn(
                'size-3.5 relative z-10',
                isMatrixActive && 'text-green-400 drop-shadow-[0_0_4px_rgba(74,222,128,0.6)]'
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
