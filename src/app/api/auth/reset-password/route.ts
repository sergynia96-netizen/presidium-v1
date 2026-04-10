import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { hashPassword } from '@/lib/auth-utils';
import {
  extractEmailFromResetIdentifier,
  getPasswordResetIdentifier,
  hashPasswordResetToken,
} from '@/lib/password-reset';

const resetPasswordSchema = z.object({
  token: z.string().min(16, 'Invalid token'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function POST(request: NextRequest) {
  try {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';

    const ipLimit = rateLimit(`auth:reset-password:ip:${ip}`, {
      maxRequests: 20,
      windowMs: 10 * 60 * 1000,
    });
    if (!ipLimit.success) {
      return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const hashedToken = hashPasswordResetToken(parsed.data.token);
    const tokenRecord = await db.verificationToken.findUnique({
      where: { token: hashedToken },
    });

    if (!tokenRecord) {
      return NextResponse.json({ error: 'Invalid or expired reset token.' }, { status: 400 });
    }

    if (tokenRecord.expires < new Date()) {
      await db.verificationToken.delete({ where: { token: hashedToken } });
      return NextResponse.json({ error: 'Invalid or expired reset token.' }, { status: 400 });
    }

    const email = extractEmailFromResetIdentifier(tokenRecord.identifier);
    if (!email) {
      await db.verificationToken.delete({ where: { token: hashedToken } });
      return NextResponse.json({ error: 'Invalid or expired reset token.' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      await db.verificationToken.delete({ where: { token: hashedToken } });
      return NextResponse.json({ error: 'Invalid or expired reset token.' }, { status: 400 });
    }

    const newPasswordHash = await hashPassword(parsed.data.password);

    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash },
      }),
      db.session.deleteMany({ where: { userId: user.id } }),
      db.verificationToken.deleteMany({ where: { identifier: getPasswordResetIdentifier(email) } }),
    ]);

    return NextResponse.json({ success: true, message: 'Password was reset successfully.' });
  } catch {
    return NextResponse.json({ error: 'Failed to reset password.' }, { status: 500 });
  }
}
