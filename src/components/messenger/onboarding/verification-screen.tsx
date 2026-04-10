'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
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

const RESEND_COUNTDOWN = 30;

interface SendCodeResponse {
  success?: boolean;
  message?: string;
  alreadyVerified?: boolean;
  devOtpPreview?: string;
}

interface VerifyCodeResponse {
  success?: boolean;
  message?: string;
  alreadyVerified?: boolean;
  error?: string;
}

export function VerificationScreen() {
  const setOnboardingStep = useAppStore((s) => s.setOnboardingStep);
  const pendingRegistration = useAppStore((s) => s.pendingRegistration);
  const { t } = useT();

  const email = pendingRegistration?.email || '';

  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(RESEND_COUNTDOWN);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [devOtpPreview, setDevOtpPreview] = useState('');

  const otpRef = useRef<HTMLDivElement>(null);
  const hasAutoRequestedRef = useRef(false);

  const canVerify = code.length === 6 && email.length > 0;

  const requestVerificationCode = useCallback(async () => {
    if (!email) return;

    setIsSendingCode(true);
    setError('');

    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = (await res.json()) as SendCodeResponse & { error?: string };

      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to send verification code.');
        return;
      }

      if (data.alreadyVerified) {
        setOnboardingStep('pin');
        return;
      }

      setInfo(data.message || 'Verification code sent.');
      setDevOtpPreview(data.devOtpPreview || '');
      setCountdown(RESEND_COUNTDOWN);
    } catch {
      setError('Network error while sending verification code.');
    } finally {
      setIsSendingCode(false);
    }
  }, [email, setOnboardingStep]);

  const handleVerify = useCallback(async () => {
    if (!canVerify) return;

    setIsVerifying(true);
    setError('');

    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });

      const data = (await res.json()) as VerifyCodeResponse;

      if (!res.ok || !data.success) {
        setError(data.error || 'Invalid or expired verification code.');
        return;
      }

      setOnboardingStep('pin');
    } catch {
      setError('Network error while verifying code.');
    } finally {
      setIsVerifying(false);
    }
  }, [canVerify, code, email, setOnboardingStep]);

  const handleResend = useCallback(async () => {
    if (countdown > 0 || isSendingCode) return;
    setCode('');
    await requestVerificationCode();
  }, [countdown, isSendingCode, requestVerificationCode]);

  // Redirect back if registration context is missing.
  useEffect(() => {
    if (!pendingRegistration) {
      setOnboardingStep('registration');
    }
  }, [pendingRegistration, setOnboardingStep]);

  // Auto-send first code once.
  useEffect(() => {
    if (!email || hasAutoRequestedRef.current) return;
    hasAutoRequestedRef.current = true;
    void requestVerificationCode();
  }, [email, requestVerificationCode]);

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

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => c - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

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
          onClick={() => setOnboardingStep('registration')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">{t('onboarding.verify.title')}</h1>
      </motion.div>

      {/* Content */}
      <motion.div
        className="flex flex-1 flex-col items-center justify-center px-6 py-8"
        variants={slideVariants as unknown as never}
        initial="hidden"
        animate="visible"
      >
        <div className="w-full max-w-sm text-center">
          {/* Icon */}
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Mail className="h-7 w-7 text-primary" />
          </div>

          <h2 className="mb-2 text-xl font-bold text-foreground">
            {t('onboarding.verify.heading')}
          </h2>
          <p className="mb-1 text-sm text-muted-foreground">
            {t('onboarding.verify.desc')}
          </p>
          <p className="mb-6 text-xs font-medium text-foreground/80">{email}</p>

          {/* OTP Input */}
          <div ref={otpRef} className="mb-6 flex justify-center">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(value) => setCode(value)}
              onComplete={() => {
                void handleVerify();
              }}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>

          {info && <p className="mb-3 text-xs text-emerald-600 dark:text-emerald-400">{info}</p>}
          {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

          {devOtpPreview && (
            <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Dev OTP preview: <span className="font-semibold tracking-wider">{devOtpPreview}</span>
            </p>
          )}

          {/* Verify button */}
          <Button
            size="lg"
            className="h-12 w-full text-base font-semibold"
            disabled={!canVerify || isVerifying}
            onClick={() => {
              void handleVerify();
            }}
          >
            {isVerifying ? (
              <motion.div
                className="h-5 w-5 rounded-full border-2 border-current border-t-transparent"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              />
            ) : (
              t('onboarding.verify.button')
            )}
          </Button>

          {/* Resend */}
          <div className="mt-5">
            {countdown > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('onboarding.verify.resendIn')}
                <span className="font-medium text-foreground">{countdown}s</span>
              </p>
            ) : (
              <button
                onClick={() => {
                  void handleResend();
                }}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                disabled={isSendingCode}
              >
                {isSendingCode ? 'Sending...' : t('onboarding.verify.resend')}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
