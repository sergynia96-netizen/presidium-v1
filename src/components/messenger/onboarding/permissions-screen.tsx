'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export function PermissionsScreen() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const setOnboardingStep = useAppStore((s) => s.setOnboardingStep);
  const { t } = useT();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleComplete = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      await completeOnboarding();
    } catch {
      // Most common cause: email is not verified yet.
      setError('Could not complete onboarding. Please verify your email and try again.');
      setOnboardingStep('verification');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* Content */}
      <motion.div
        className="flex flex-1 flex-col items-center justify-center px-6 py-8"
        variants={containerVariants as unknown as never}
        initial="hidden"
        animate="visible"
      >
        <div className="w-full max-w-sm text-center">
          {/* Bell Icon */}
          <motion.div
            variants={itemVariants as unknown as never}
            className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10"
          >
            <Bell className="h-9 w-9 text-primary" />
          </motion.div>

          {/* Title */}
          <motion.h2
            variants={itemVariants as unknown as never}
            className="mb-2 text-2xl font-bold text-foreground"
          >
            {t('onboarding.perms.title')}
          </motion.h2>

          {/* Description */}
          <motion.p
            variants={itemVariants as unknown as never}
            className="mx-auto mb-10 max-w-[280px] text-sm leading-relaxed text-muted-foreground"
          >
            {t('onboarding.perms.desc')}
          </motion.p>

          {/* Illustration dots */}
          <motion.div
            variants={itemVariants as unknown as never}
            className="mb-10 flex items-center justify-center gap-1"
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-primary/40"
                animate={{ scale: [1, 1.3, 1] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </motion.div>

          {/* Buttons */}
          <motion.div variants={itemVariants as unknown as never} className="space-y-3">
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button
              size="lg"
              className="h-12 w-full text-base font-semibold"
              disabled={isSubmitting}
              onClick={() => {
                void handleComplete();
              }}
            >
              {isSubmitting ? 'Please wait...' : t('onboarding.perms.allow')}
            </Button>

            <Button
              variant="ghost"
              className="w-full text-sm text-muted-foreground"
              disabled={isSubmitting}
              onClick={() => {
                void handleComplete();
              }}
            >
              {t('onboarding.perms.skip')}
            </Button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
