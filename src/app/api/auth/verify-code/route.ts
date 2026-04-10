import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { hashOtpCode } from '@/lib/otp';

const verifyCodeSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().regex(/^\d{6}$/, 'Verification code must contain 6 digits'),
});

export async function POST(request: NextRequest) {
  try {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';

    const ipLimit = rateLimit(`auth:verify-code:ip:${ip}`, {
      maxRequests: 30,
      windowMs: 10 * 60 * 1000,
    });
    if (!ipLimit.success) {
      return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = verifyCodeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const code = parsed.data.code;

    const emailLimit = rateLimit(`auth:verify-code:email:${email}`, {
      maxRequests: 15,
      windowMs: 10 * 60 * 1000,
    });
    if (!emailLimit.success) {
      return NextResponse.json({ error: 'Too many verification attempts for this email.' }, { status: 429 });
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired verification code.' }, { status: 400 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ success: true, alreadyVerified: true, message: 'Email is already verified.' });
    }

    const token = hashOtpCode(email, code);
    const verificationRecord = await db.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationRecord || verificationRecord.identifier !== email) {
      return NextResponse.json({ error: 'Invalid or expired verification code.' }, { status: 400 });
    }

    if (verificationRecord.expires < new Date()) {
      await db.verificationToken.deleteMany({ where: { identifier: email } });
      return NextResponse.json({ error: 'Verification code expired. Please request a new one.' }, { status: 400 });
    }

    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      }),
      db.verificationToken.deleteMany({ where: { identifier: email } }),
    ]);

    return NextResponse.json({ success: true, message: 'Email verified successfully.' });
  } catch {
    return NextResponse.json({ error: 'Failed to verify code.' }, { status: 500 });
  }
}
