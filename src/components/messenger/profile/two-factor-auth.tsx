'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Shield, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAppStore } from '@/store/use-app-store';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

interface TwoFactorStatusResponse {
  enabled: boolean;
  hasSecret: boolean;
  requiresVerification: boolean;
  error?: string;
}

interface TwoFactorSetupResponse {
  success?: boolean;
  setup?: {
    secret: string;
    otpAuthUrl: string;
    qrCodeDataUrl: string;
  };
  error?: string;
}

interface TwoFactorActionResponse {
  success?: boolean;
  enabled?: boolean;
  error?: string;
}

export default function TwoFactorScreen() {
  const { goBack, user } = useAppStore();
  const { t } = useT();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [setupQrDataUrl, setSetupQrDataUrl] = useState('');
  const [setupOtpUrl, setSetupOtpUrl] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);

  const isSetupInProgress = useMemo(() => Boolean(setupSecret && !enabled), [enabled, setupSecret]);

  const loadStatus = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/users/${user.id}/2fa`, {
        method: 'GET',
      });
      const data = (await res.json()) as TwoFactorStatusResponse;

      if (!res.ok) {
        setError(data.error || 'Failed to load 2FA status.');
        return;
      }

      setEnabled(Boolean(data.enabled));
      if (!data.requiresVerification) {
        setSetupSecret('');
        setSetupQrDataUrl('');
        setSetupOtpUrl('');
        setVerifyCode('');
      }
    } catch {
      setError('Failed to load 2FA status.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleSetup = async () => {
    if (!user?.id) return;

    setIsSubmitting(true);
    setError('');
    setInfo('');

    try {
      const res = await fetch(`/api/users/${user.id}/2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setup' }),
      });

      const data = (await res.json()) as TwoFactorSetupResponse;
      if (!res.ok || !data.success || !data.setup) {
        setError(data.error || 'Failed to start 2FA setup.');
        return;
      }

      setSetupSecret(data.setup.secret);
      setSetupQrDataUrl(data.setup.qrCodeDataUrl);
      setSetupOtpUrl(data.setup.otpAuthUrl);
      setInfo('Scan QR code in your authenticator app, then enter code below.');
    } catch {
      setError('Failed to start 2FA setup.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyEnable = async () => {
    if (!user?.id || !verifyCode.trim()) return;

    setIsSubmitting(true);
    setError('');
    setInfo('');

    try {
      const res = await fetch(`/api/users/${user.id}/2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_enable', code: verifyCode }),
      });

      const data = (await res.json()) as TwoFactorActionResponse;
      if (!res.ok || !data.success) {
        setError(data.error || 'Invalid verification code.');
        return;
      }

      setEnabled(true);
      setSetupSecret('');
      setSetupQrDataUrl('');
      setSetupOtpUrl('');
      setVerifyCode('');
      setInfo(t('twofa.enabled'));
    } catch {
      setError('Failed to enable 2FA.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisable = async () => {
    if (!user?.id || !disableCode.trim()) return;

    setIsSubmitting(true);
    setError('');
    setInfo('');

    try {
      const res = await fetch(`/api/users/${user.id}/2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable', code: disableCode }),
      });

      const data = (await res.json()) as TwoFactorActionResponse;
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to disable 2FA.');
        return;
      }

      setEnabled(false);
      setDisableCode('');
      setDisableDialogOpen(false);
      setInfo(t('twofa.disabled'));
      await loadStatus();
    } catch {
      setError('Failed to disable 2FA.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3 shrink-0">
        <Button variant="ghost" size="icon" className="size-9" onClick={goBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold">{t('twofa.title')}</h1>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl p-4 lg:p-6 space-y-5 pb-8">
          <div className="flex justify-center pt-2">
            <div
              className={cn(
                'flex size-20 items-center justify-center rounded-full',
                enabled ? 'bg-emerald-500/10' : 'bg-amber-500/10',
              )}
            >
              {enabled ? (
                <ShieldCheck className="size-10 text-emerald-500" />
              ) : (
                <Shield className="size-10 text-amber-500" />
              )}
            </div>
          </div>

          <div className="flex justify-center">
            <Badge
              className={cn(
                'gap-1.5 border-0 px-3 py-1 text-sm',
                enabled
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {enabled ? (
                <>
                  <span className="size-2 rounded-full bg-emerald-500" />
                  {t('twofa.enabled')}
                </>
              ) : (
                t('profile.off')
              )}
            </Badge>
          </div>

          <p className="text-center text-sm text-muted-foreground max-w-sm mx-auto">{t('twofa.desc')}</p>

          {isLoading && <p className="text-center text-sm text-muted-foreground">Loading 2FA status...</p>}
          {error && <p className="text-center text-sm text-destructive">{error}</p>}
          {info && <p className="text-center text-sm text-emerald-600 dark:text-emerald-400">{info}</p>}

          {!isLoading && !enabled && !isSetupInProgress && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Enable two-factor authentication with an authenticator app.
                </p>
                <Button className="w-full" onClick={handleSetup} disabled={isSubmitting || !user?.id}>
                  {isSubmitting ? 'Preparing...' : 'Set up authenticator app'}
                </Button>
              </CardContent>
            </Card>
          )}

          {!isLoading && !enabled && isSetupInProgress && (
            <Card>
              <CardContent className="p-4 space-y-4">
                {setupQrDataUrl && (
                  <div className="flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={setupQrDataUrl} alt="2FA QR code" className="rounded-lg border" />
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Manual setup key</Label>
                  <code className="block rounded bg-muted px-2 py-1 text-xs break-all">{setupSecret}</code>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="twofa-verify-code">Verification code</Label>
                  <Input
                    id="twofa-verify-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                  />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={handleSetup} disabled={isSubmitting}>
                    Regenerate
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleVerifyEnable}
                    disabled={isSubmitting || verifyCode.length !== 6}
                  >
                    <Check className="size-4 mr-1" />
                    Verify & Enable
                  </Button>
                </div>

                {setupOtpUrl && (
                  <p className="text-[11px] text-muted-foreground break-all">
                    OTP Auth URL: {setupOtpUrl}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {!isLoading && enabled && (
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="p-4 space-y-4">
                <div className="text-center">
                  <ShieldCheck className="size-8 text-emerald-500 mx-auto" />
                  <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">2FA is active</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="twofa-disable-code">Enter current 2FA code to disable</Label>
                  <Input
                    id="twofa-disable-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                  />
                </div>

                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setDisableDialogOpen(true)}
                  disabled={disableCode.length !== 6}
                >
                  {t('twofa.disable')}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>

      <Dialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('twofa.disable')}</DialogTitle>
            <DialogDescription>{t('twofa.confirmDisable')}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDisableDialogOpen(false)}>
              {t('editProfile.cancel')}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                void handleDisable();
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Disabling...' : t('twofa.disable')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
