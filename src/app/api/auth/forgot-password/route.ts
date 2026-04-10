import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import {
  generatePasswordResetToken,
  getPasswordResetExpiryDate,
  getPasswordResetIdentifier,
  hashPasswordResetToken,
  isDevPasswordResetPreviewEnabled,
} from '@/lib/password-reset';
import { isSmtpConfigured, sendPasswordResetEmail } from '@/lib/email';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(request: NextRequest) {
  try {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';

    const ipLimit = rateLimit(`auth:forgot-password:ip:${ip}`, {
      maxRequests: 20,
      windowMs: 10 * 60 * 1000,
    });
    if (!ipLimit.success) {
      return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();

    const emailLimit = rateLimit(`auth:forgot-password:email:${email}`, {
      maxRequests: 6,
      windowMs: 10 * 60 * 1000,
    });
    if (!emailLimit.success) {
      return NextResponse.json({ error: 'Too many reset requests for this email.' }, { status: 429 });
    }

    const response: {
      success: true;
      message: string;
      expiresAt?: string;
      devResetPreview?: { token: string; url: string };
    } = {
      success: true,
      message: 'If this account exists, password reset instructions have been sent.',
    };

    const user = await db.user.findUnique({ where: { email } });

    if (user) {
      const rawToken = generatePasswordResetToken();
      const hashedToken = hashPasswordResetToken(rawToken);
      const identifier = getPasswordResetIdentifier(email);
      const expires = getPasswordResetExpiryDate();
      const resetUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/reset-password?token=${rawToken}`;
      const expiresInMinutes = Math.max(1, Math.round((expires.getTime() - Date.now()) / 60000));
      const devPreview = isDevPasswordResetPreviewEnabled();
      const smtpReady = isSmtpConfigured();

      if (!smtpReady && !devPreview) {
        return NextResponse.json(
          { error: 'Email delivery is not configured on server (SMTP).' },
          { status: 500 },
        );
      }

      await db.$transaction([
        db.verificationToken.deleteMany({ where: { identifier } }),
        db.verificationToken.create({
          data: {
            identifier,
            token: hashedToken,
            expires,
          },
        }),
      ]);

      response.expiresAt = expires.toISOString();

      if (smtpReady) {
        try {
          await sendPasswordResetEmail({
            to: email,
            resetUrl,
            expiresInMinutes,
          });
        } catch (error: unknown) {
          console.error('[auth/forgot-password] SMTP send failed:', error);
          await db.verificationToken.deleteMany({ where: { identifier } });
          return NextResponse.json(
            { error: 'Failed to deliver reset email. Check SMTP settings.' },
            { status: 500 },
          );
        }
      }

      if (devPreview) {
        response.devResetPreview = {
          token: rawToken,
          url: resetUrl,
        };
      }
    }

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: 'Failed to process forgot-password request.' }, { status: 500 });
  }
}
