'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, UserIcon, Lock, AtSign, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

export function RegistrationScreen() {
  const setOnboardingStep = useAppStore((s) => s.setOnboardingStep);
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const canContinue = email.length > 0 && name.length > 0 && password.length >= 8;

  const handleSubmit = async () => {
    if (!canContinue) return;
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, username: username || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.details?.formErrors?.[0] || 'Registration failed');
        return;
      }

      // Store the registered user in Zustand for the rest of onboarding
      useAppStore.setState({
        pendingRegistration: {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          username: data.user.username ? `@${data.user.username}` : undefined,
          avatar: data.user.avatar || '',
          status: 'online',
          pinEnabled: false,
        },
        pendingPassword: password, // stored temporarily for signIn after onboarding
      });

      setOnboardingStep('verification');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
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
          onClick={() => setOnboardingStep('welcome')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">{t('onboarding.reg.title')}</h1>
      </motion.div>

      {/* Form */}
      <motion.div
        className="flex flex-1 flex-col justify-center px-6 py-8"
        variants={slideVariants as unknown as never}
        initial="hidden"
        animate="visible"
      >
        <div className="mx-auto w-full max-w-sm space-y-5">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">{t('onboarding.reg.email')}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder={t('onboarding.reg.emailPlaceholder')}
                className="pl-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">{t('onboarding.reg.name')}</Label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="name"
                type="text"
                placeholder={t('onboarding.reg.namePlaceholder')}
                className="pl-9"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password">{t('onboarding.reg.password')}</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder={t('onboarding.reg.passwordHint')}
                className="pl-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>

          {/* Username (optional) */}
          <div className="space-y-2">
            <Label htmlFor="username">
              {t('onboarding.reg.username')}
              <span className="ml-1 text-xs text-muted-foreground">
                ({t('onboarding.reg.optional')})
              </span>
            </Label>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="username"
                type="text"
                placeholder={t('onboarding.reg.usernamePlaceholder')}
                className="pl-9"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                autoComplete="username"
              />
            </div>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          {/* Submit */}
          <Button
            size="lg"
            className="h-12 w-full text-base font-semibold"
            disabled={!canContinue || isLoading}
            onClick={handleSubmit}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              t('onboarding.reg.continue')
            )}
          </Button>

          {/* Terms */}
          <p className="text-center text-xs text-muted-foreground leading-relaxed">
            {t('onboarding.reg.terms')}
            <span className="text-primary cursor-pointer hover:underline">
              {t('onboarding.reg.termsLink')}
            </span>
            {t('onboarding.reg.and')}
            <span className="text-primary cursor-pointer hover:underline">
              {t('onboarding.reg.privacyLink')}
            </span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
