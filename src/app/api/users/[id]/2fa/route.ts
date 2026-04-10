import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import QRCode from 'qrcode';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { decryptSecret, encryptSecret } from '@/lib/secure-secret';
import {
  buildTwoFactorOtpAuthUrl,
  generateTwoFactorSecret,
  verifyTwoFactorCode,
} from '@/lib/two-factor';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setup') }),
  z.object({ action: z.literal('verify_enable'), code: z.string().min(4).max(12) }),
  z.object({ action: z.literal('disable'), code: z.string().min(4).max(12) }),
]);

async function getAuthedUserOrReject(userId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (session.user.id !== userId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await getAuthedUserOrReject(id);
    if (auth.error) return auth.error;

    const settings = await db.userSettings.upsert({
      where: { userId: id },
      update: {},
      create: { userId: id },
      select: {
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    return NextResponse.json({
      enabled: settings.twoFactorEnabled,
      hasSecret: Boolean(settings.twoFactorSecret),
      requiresVerification: Boolean(settings.twoFactorSecret) && !settings.twoFactorEnabled,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch 2FA status' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await getAuthedUserOrReject(id);
    if (auth.error) return auth.error;

    const limit = rateLimit(`2fa:post:${id}`, {
      maxRequests: 40,
      windowMs: 10 * 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many 2FA requests. Please try again later.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const settings = await db.userSettings.upsert({
      where: { userId: id },
      update: {},
      create: { userId: id },
      select: {
        id: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });

    if (parsed.data.action === 'setup') {
      const user = await db.user.findUnique({
        where: { id },
        select: { email: true },
      });
      if (!user?.email) {
        return NextResponse.json({ error: 'User email not found' }, { status: 400 });
      }

      const secret = generateTwoFactorSecret();
      const encryptedSecret = encryptSecret(secret);
      const otpAuthUrl = buildTwoFactorOtpAuthUrl(user.email, secret);
      const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 220,
      });

      await db.userSettings.update({
        where: { id: settings.id },
        data: {
          twoFactorSecret: encryptedSecret,
          twoFactorEnabled: false,
        },
      });

      return NextResponse.json({
        success: true,
        setup: {
          secret,
          otpAuthUrl,
          qrCodeDataUrl,
        },
      });
    }

    if (!settings.twoFactorSecret) {
      return NextResponse.json({ error: '2FA is not set up yet.' }, { status: 400 });
    }

    let decryptedSecret: string;
    try {
      decryptedSecret = decryptSecret(settings.twoFactorSecret);
    } catch {
      return NextResponse.json({ error: 'Stored 2FA secret is invalid.' }, { status: 500 });
    }

    if (parsed.data.action === 'verify_enable') {
      const ok = await verifyTwoFactorCode(parsed.data.code, decryptedSecret);
      if (!ok) {
        return NextResponse.json({ error: 'Invalid verification code.' }, { status: 400 });
      }

      await db.userSettings.update({
        where: { id: settings.id },
        data: { twoFactorEnabled: true },
      });

      return NextResponse.json({ success: true, enabled: true });
    }

    if (parsed.data.action === 'disable') {
      if (!settings.twoFactorEnabled) {
        return NextResponse.json({ error: '2FA is already disabled.' }, { status: 400 });
      }

      const ok = await verifyTwoFactorCode(parsed.data.code, decryptedSecret);
      if (!ok) {
        return NextResponse.json({ error: 'Invalid verification code.' }, { status: 400 });
      }

      await db.userSettings.update({
        where: { id: settings.id },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
        },
      });

      return NextResponse.json({ success: true, enabled: false });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Failed to process 2FA request' }, { status: 500 });
  }
}
