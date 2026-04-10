import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { rateLimit } from '@/lib/rate-limit';
import { issueDeviceLinkCode, revokeDeviceLinkCode } from '@/lib/device-link';

/**
 * POST /api/devices/link
 * Generates a short-lived one-time device linking code.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`devices:link:create:${session.user.id}`, {
      maxRequests: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many link code requests. Please try again later.' },
        { status: 429 },
      );
    }

    const link = await issueDeviceLinkCode(session.user.id);
    const origin = request.nextUrl.origin;
    const pairingUri = `${origin}/login?mode=device&owner=${encodeURIComponent(link.ownerUserId)}&code=${encodeURIComponent(link.displayCode)}`;

    return NextResponse.json({
      success: true,
      link: {
        ownerUserId: link.ownerUserId,
        code: link.displayCode,
        expiresAt: link.expiresAt,
        pairingUri,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/devices/link
 * Revokes active device linking code for current user.
 */
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`devices:link:revoke:${session.user.id}`, {
      maxRequests: 20,
      windowMs: 10 * 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many revoke requests. Please try again later.' },
        { status: 429 },
      );
    }

    const deletedCount = await revokeDeviceLinkCode(session.user.id);
    return NextResponse.json({ success: true, deletedCount });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
