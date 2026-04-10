'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Shield, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export function WelcomeScreen() {
  const setOnboardingStep = useAppStore((s) => s.setOnboardingStep);
  const { t } = useT();

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background">
      {/* Subtle background pattern */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Decorative gradient orbs */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-72 w-72 rounded-full bg-primary/8 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-72 w-72 rounded-full bg-primary/8 blur-3xl" />

      <motion.div
        className="relative z-10 flex w-full max-w-sm flex-col items-center px-6 text-center"
        variants={containerVariants as unknown as never}
        initial="hidden"
        animate="visible"
      >
        {/* Logo */}
        <motion.div
          variants={itemVariants as unknown as never}
          className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 shadow-lg ring-1 ring-primary/20"
        >
          <Shield className="h-12 w-12 text-primary" strokeWidth={1.5} />
        </motion.div>

        {/* App name */}
        <motion.h1
          variants={itemVariants as unknown as never}
          className="mb-2 text-3xl font-extrabold tracking-tight text-foreground"
        >
          PRESIDIUM
        </motion.h1>

        {/* Tagline */}
        <motion.p
          variants={itemVariants as unknown as never}
          className="mb-10 text-sm text-muted-foreground"
        >
          {t('onboarding.welcome.tagline')}
        </motion.p>

        {/* Feature highlights */}
        <motion.div
          variants={itemVariants as unknown as never}
          className="mb-10 flex w-full flex-col gap-3"
        >
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3.5 shadow-sm">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <Shield className="h-4.5 w-4.5" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">{t('onboarding.welcome.e2e.title')}</p>
              <p className="text-xs text-muted-foreground">
                {t('onboarding.welcome.e2e.desc')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border bg-card p-3.5 shadow-sm">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">{t('onboarding.welcome.ai.title')}</p>
              <p className="text-xs text-muted-foreground">
                {t('onboarding.welcome.ai.desc')}
              </p>
            </div>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div variants={itemVariants as unknown as never} className="w-full space-y-2">
          <Button
            size="lg"
            className="h-12 w-full text-base font-semibold"
            onClick={() => setOnboardingStep('registration')}
          >
         {t('onboarding.welcome.cta')}
          </Button>
          <Button asChild variant="ghost" size="lg" className="h-11 w-full text-sm">
            <Link href="/login">I already have an account</Link>
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
