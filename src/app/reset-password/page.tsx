import Link from 'next/link';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

interface ResetPasswordPageProps {
  searchParams: Promise<{
    token?: string;
  }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const rawToken = params.token;
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';

  if (!token) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm text-center">
          <h1 className="text-xl font-semibold text-foreground">Invalid reset link</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The password reset link is missing or invalid.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Request a new one on{' '}
            <Link href="/forgot-password" className="font-medium text-primary hover:underline">
              forgot password
            </Link>
            .
          </p>
        </div>
      </main>
    );
  }

  return <ResetPasswordForm token={token} />;
}
