import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

type SessionDeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

const deleteSchema = z.object({
  sessionId: z.string().min(1).optional(),
  revokeAllOthers: z.boolean().optional(),
});

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

function getCurrentSessionTokenFromCookies(request: NextRequest): string | null {
  return (
    request.cookies.get('__Secure-next-auth.session-token')?.value ||
    request.cookies.get('next-auth.session-token')?.value ||
    null
  );
}

function detectDeviceType(userAgent: string | null): SessionDeviceType {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (ua.includes('ipad') || (ua.includes('android') && !ua.includes('mobile'))) return 'tablet';
  if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('android')) return 'mobile';
  return 'desktop';
}

function detectDeviceName(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const ua = userAgent.toLowerCase();
  if (ua.includes('edg/')) return 'Microsoft Edge';
  if (ua.includes('chrome/') && !ua.includes('edg/')) return 'Google Chrome';
  if (ua.includes('firefox/')) return 'Mozilla Firefox';
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'Safari';
  return 'Browser';
}

/**
 * GET /api/sessions - List active sessions for current user.
 * Works with JWT strategy by returning a real current-session snapshot,
 * and also includes DB sessions when available.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`sessions:list:${session.user.id}`, {
      maxRequests: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const [dbSessions, token] = await Promise.all([
      db.session
        .findMany({
          where: { userId: session.user.id },
          orderBy: { expires: 'desc' },
          select: {
            id: true,
            sessionToken: true,
            expires: true,
          },
        })
        .catch(() => []),
      getToken({ req: request, secret: process.env.NEXTAUTH_SECRET }),
    ]);

    const currentToken = getCurrentSessionTokenFromCookies(request);
    const currentExpires =
      typeof token?.exp === 'number' ? new Date(token.exp * 1000).toISOString() : null;
    const currentUserAgent = request.headers.get('user-agent');

    const mappedDb = dbSessions.map((row) => ({
      id: row.id,
      current: Boolean(currentToken && row.sessionToken === currentToken),
      userAgent: null as string | null,
      ipAddress: null as string | null,
      lastActiveAt: null as string | null,
      expiresAt: row.expires.toISOString(),
      deviceType: 'unknown' as SessionDeviceType,
      deviceName: 'Unknown device',
      source: 'database' as const,
    }));

    const hasCurrentInDb = mappedDb.some((row) => row.current);
    const currentDeviceType = detectDeviceType(currentUserAgent);
    const currentDeviceName = detectDeviceName(currentUserAgent);

    const enrichedDb = mappedDb.map((row) =>
      row.current
        ? {
            ...row,
            userAgent: currentUserAgent,
            ipAddress: getClientIp(request),
            lastActiveAt: new Date().toISOString(),
            deviceType: currentDeviceType,
            deviceName: currentDeviceName,
          }
        : row,
    );

    const currentSession = {
      id: 'current',
      current: true,
      userAgent: currentUserAgent,
      ipAddress: getClientIp(request),
      lastActiveAt: new Date().toISOString(),
      expiresAt: currentExpires,
      deviceType: currentDeviceType,
      deviceName: currentDeviceName,
      source: 'jwt' as const,
    };

    const sessions = hasCurrentInDb ? enrichedDb : [currentSession, ...enrichedDb];

    return NextResponse.json({
      sessions,
      canRevokeOtherSessions: true,
      canRevokeCurrentSession: false,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/sessions - Revoke one session or all other sessions.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`sessions:revoke:${session.user.id}`, {
      maxRequests: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const parseResult = deleteSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.flatten() },
        { status: 400 },
      );
    }

    const { sessionId, revokeAllOthers } = parseResult.data;
    const currentToken = getCurrentSessionTokenFromCookies(request);

    if (revokeAllOthers) {
      const deleted = await db.session.deleteMany({
        where: {
          userId: session.user.id,
          ...(currentToken ? { sessionToken: { not: currentToken } } : {}),
        },
      });

      return NextResponse.json({
        success: true,
        deletedCount: deleted.count,
      });
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId or revokeAllOthers must be provided' },
        { status: 400 },
      );
    }

    if (sessionId === 'current') {
      return NextResponse.json(
        { error: 'Current session revoke is handled via sign-out flow' },
        { status: 400 },
      );
    }

    const target = await db.session.findFirst({
      where: {
        id: sessionId,
        userId: session.user.id,
      },
      select: { id: true },
    });

    if (!target) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    await db.session.delete({ where: { id: target.id } });

    return NextResponse.json({ success: true, deletedCount: 1 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
