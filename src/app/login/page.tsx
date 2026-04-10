'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();

  const [mode, setMode] = useState<'password' | 'device'>(() => {
    if (typeof window === 'undefined') return 'password';
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'device' ? 'device' : 'password';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [deviceLinkOwnerId, setDeviceLinkOwnerId] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return params.get('owner') || '';
  });
  const [deviceLinkCode, setDeviceLinkCode] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code') || '';
    return code.toUpperCase();
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/');
    }
  }, [router, status]);

  const callbackUrl = '/';

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const isDeviceMode = mode === 'device';
    const normalizedCode = deviceLinkCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const normalizedOwnerId = deviceLinkOwnerId.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    let result: Awaited<ReturnType<typeof signIn>>;
    if (isDeviceMode) {
      if (!normalizedOwnerId || !normalizedCode) {
        setIsLoading(false);
        setError('Owner ID and device-link code are required.');
        return;
      }

      result = await signIn('credentials', {
        deviceLinkOwnerId: normalizedOwnerId,
        deviceLinkCode: normalizedCode,
        redirect: false,
        callbackUrl,
      });
    } else {
      if (!normalizedEmail || !normalizedPassword) {
        setIsLoading(false);
        setError('Email and password are required.');
        return;
      }

      result = await signIn('credentials', {
        email: normalizedEmail,
        password: normalizedPassword,
        twoFactorCode: twoFactorCode || undefined,
        redirect: false,
        callbackUrl,
      });
    }

    setIsLoading(false);

    if (result?.error) {
      setError(
        isDeviceMode
          ? 'Invalid or expired device-link code.'
          : 'Invalid credentials or 2FA code. Please try again.',
      );
      return;
    }

    router.replace(result?.url || callbackUrl);
    router.refresh();
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Shield className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Sign in to PRESIDIUM</h1>
            <p className="text-xs text-muted-foreground">
              Use password or one-time device-link code.
            </p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border/60 p-1">
          <Button
            type="button"
            variant={mode === 'password' ? 'default' : 'ghost'}
            className="h-9"
            onClick={() => setMode('password')}
            disabled={isLoading}
          >
            Password
          </Button>
          <Button
            type="button"
            variant={mode === 'device' ? 'default' : 'ghost'}
            className="h-9"
            onClick={() => setMode('device')}
            disabled={isLoading}
          >
            Device Link
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'password' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isLoading}
                />
                <div className="text-right">
                  <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="twoFactorCode">2FA code (if enabled)</Label>
                <Input
                  id="twoFactorCode"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  disabled={isLoading}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="deviceLinkOwnerId">Owner User ID</Label>
                <Input
                  id="deviceLinkOwnerId"
                  type="text"
                  value={deviceLinkOwnerId}
                  onChange={(e) => setDeviceLinkOwnerId(e.target.value)}
                  placeholder="user_cuid"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="deviceLinkCode">One-time link code</Label>
                <Input
                  id="deviceLinkCode"
                  type="text"
                  value={deviceLinkCode}
                  onChange={(e) => setDeviceLinkCode(e.target.value.toUpperCase())}
                  placeholder="ABCD-EFGH"
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Generate this code in your already logged-in device: Profile → Active Devices.
                </p>
              </div>
            </>
          )}

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="h-11 w-full" disabled={isLoading}>
            {isLoading ? 'Signing in...' : mode === 'device' ? 'Link Device' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          No account yet?{' '}
          <Link href="/" className="font-medium text-primary hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
