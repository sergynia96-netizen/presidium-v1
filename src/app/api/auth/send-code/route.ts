import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { generateOtpCode, getOtpExpiryDate, hashOtpCode, isDevOtpPreviewEnabled } from '@/lib/otp';
import { isSmtpConfigured, sendVerificationCodeEmail } from '@/lib/email';

const sendCodeSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export async function POST(request: NextRequest) {
  try {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';

    const ipLimit = rateLimit(`auth:send-code:ip:${ip}`, {
      maxRequests: 20,
      windowMs: 10 * 60 * 1000,
    });
    if (!ipLimit.success) {
      return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = sendCodeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();

    const emailLimit = rateLimit(`auth:send-code:email:${email}`, {
      maxRequests: 5,
      windowMs: 10 * 60 * 1000,
    });
    if (!emailLimit.success) {
      return NextResponse.json({ error: 'Too many code requests for this email.' }, { status: 429 });
    }

    const user = await db.user.findUnique({ where: { email } });

    // Return generic success to avoid account enumeration.
    if (!user) {
      return NextResponse.json({ success: true, message: 'If this account exists, a verification code has been sent.' });
    }

    if (user.emailVerified) {
      return NextResponse.json({ success: true, alreadyVerified: true, message: 'Email is already verified.' });
    }

    const code = generateOtpCode();
    const token = hashOtpCode(email, code);
    const expires = getOtpExpiryDate();
    const expiresInMinutes = Math.max(1, Math.round((expires.getTime() - Date.now()) / 60000));
    const devPreview = isDevOtpPreviewEnabled();
    const smtpReady = isSmtpConfigured();

    if (!smtpReady && !devPreview) {
      return NextResponse.json(
        { error: 'Email delivery is not configured on server (SMTP).' },
        { status: 500 },
      );
    }

    await db.$transaction([
      db.verificationToken.deleteMany({ where: { identifier: email } }),
      db.verificationToken.create({
        data: {
          identifier: email,
          token,
          expires,
        },
      }),
    ]);

    if (smtpReady) {
      try {
        await sendVerificationCodeEmail({ to: email, code, expiresInMinutes });
      } catch (error: unknown) {
        console.error('[auth/send-code] SMTP send failed:', error);
        await db.verificationToken.deleteMany({ where: { identifier: email } });
        return NextResponse.json(
          { error: 'Failed to deliver verification email. Check SMTP settings.' },
          { status: 500 },
        );
      }
    }

    const response: { success: true; message: string; expiresAt: string; devOtpPreview?: string } = {
      success: true,
      message: 'Verification code sent.',
      expiresAt: expires.toISOString(),
    };

    if (devPreview) {
      response.devOtpPreview = code;
    }

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: 'Failed to send verification code.' }, { status: 500 });
  }
}
