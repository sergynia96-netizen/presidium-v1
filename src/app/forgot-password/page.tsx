'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ForgotPasswordResponse {
  success?: boolean;
  message?: string;
  error?: string;
  devResetPreview?: {
    token: string;
    url: string;
  };
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [devPreviewUrl, setDevPreviewUrl] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email.trim()) {
      setError('Email is required.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setMessage('');
    setDevPreviewUrl('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = (await res.json()) as ForgotPasswordResponse;

      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to process request. Please try again.');
        return;
      }

      setMessage(data.message || 'If this account exists, reset instructions were sent.');
      setDevPreviewUrl(data.devResetPreview?.url || '');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Mail className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Reset password</h1>
            <p className="text-xs text-muted-foreground">Enter your account email to receive reset instructions.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={isSubmitting}
            />
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {message && (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              {message}
            </p>
          )}

          {devPreviewUrl && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Dev preview reset link:{' '}
              <a href={devPreviewUrl} className="font-semibold underline" target="_blank" rel="noreferrer">
                open reset page
              </a>
            </p>
          )}

          <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Send reset instructions'}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Back to{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
