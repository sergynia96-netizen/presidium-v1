import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { sign } from 'jsonwebtoken';
import { authOptions } from '@/lib/auth-options';
import { rateLimit } from '@/lib/rate-limit';

const EXPIRES_IN_SECONDS = 2 * 60 * 60;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const forwarded = request.headers.get('x-forwarded-for');
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';
    const limit = rateLimit(`relay-token:${session.user.id}:${ip}`, {
      maxRequests: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many token requests' }, { status: 429 });
    }

    const secret =
      process.env.RELAY_JWT_SECRET ||
      process.env.JWT_SECRET ||
      process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return NextResponse.json({ error: 'JWT secret is not configured' }, { status: 500 });
    }

    const token = sign(
      {
        sub: session.user.id,
        id: session.user.id,
        email: session.user.email || null,
      },
      secret,
      {
        expiresIn: EXPIRES_IN_SECONDS,
        issuer: 'presidium-web',
      },
    );

    return NextResponse.json({
      token,
      expiresIn: EXPIRES_IN_SECONDS,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to issue relay token' }, { status: 500 });
  }
}
