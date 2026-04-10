'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';

const slideVariants = {
  hidden: { opacity: 0, x: 40 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export function PinSetupScreen() {
  const setOnboardingStep = useAppStore((s) => s.setOnboardingStep);
  const { t } = useT();
  const [pin, setPin] = useState('');
  const otpRef = useRef<HTMLDivElement>(null);

  const canContinue = pin.length === 4;

  // Auto-focus the OTP input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      const firstSlot = otpRef.current?.querySelector('input');
      if (firstSlot instanceof HTMLInputElement) {
        firstSlot.focus();
      }
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const handleContinue = () => {
    if (!canContinue) return;
    setOnboardingStep('permissions');
  };

  const handleSkip = () => {
    setOnboardingStep('permissions');
  };

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-3 border-b px-4 py-3"
      >
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2"
          onClick={() => setOnboardingStep('verification')}
        >
          <Shield className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">{t('onboarding.pin.title')}</h1>
      </motion.div>

      {/* Content */}
      <motion.div
        className="flex flex-1 flex-col items-center justify-center px-6 py-8"
        variants={slideVariants as unknown as never}
        initial="hidden"
        animate="visible"
      >
        <div className="w-full max-w-sm text-center">
          {/* Shield Icon */}
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Shield className="h-8 w-8 text-primary" strokeWidth={1.5} />
          </div>

          {/* Title */}
          <h2 className="mb-2 text-xl font-bold text-foreground">
            {t('onboarding.pin.heading')}
          </h2>

          {/* Description */}
          <p className="mx-auto mb-3 max-w-[260px] text-sm leading-relaxed text-muted-foreground">
            {t('onboarding.pin.desc')}
          </p>

          {/* Badge */}
          <div className="mb-8 flex justify-center">
            <Badge variant="secondary" className="text-xs font-normal">
              {t('onboarding.pin.badge')}
            </Badge>
          </div>

          {/* PIN Input */}
          <div ref={otpRef} className="mb-8 flex justify-center">
            <InputOTP maxLength={4} value={pin} onChange={(value) => setPin(value)}>
              <InputOTPGroup>
                <InputOTPSlot index={0} className="h-12 w-12 text-lg" />
                <InputOTPSlot index={1} className="h-12 w-12 text-lg" />
                <InputOTPSlot index={2} className="h-12 w-12 text-lg" />
                <InputOTPSlot index={3} className="h-12 w-12 text-lg" />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            <Button
              size="lg"
              className="h-12 w-full text-base font-semibold"
              disabled={!canContinue}
              onClick={handleContinue}
            >
              {t('onboarding.pin.continue')}
            </Button>

            <Button
              variant="ghost"
              className="w-full text-sm text-muted-foreground"
              onClick={handleSkip}
            >
                 {t("onboarding.pin.skip")}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
