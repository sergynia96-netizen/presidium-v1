import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { authenticateApiKey } from '@/lib/api-key-auth';

export async function GET(request: NextRequest) {
  try {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';
    const publicLimit = rateLimit(`v1:index:${ip}`, {
      maxRequests: 120,
      windowMs: 60 * 1000,
    });
    if (!publicLimit.success) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: publicLimit.retryAfter },
        { status: 429 },
      );
    }

    const auth = await authenticateApiKey(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    return NextResponse.json({
      success: true,
      version: 'v1',
      user: {
        id: auth.context.userId,
        name: auth.context.userName,
      },
      apiKey: {
        id: auth.context.apiKeyId,
        permissions: auth.context.permissions,
      },
      endpoints: ['POST /api/v1/messages'],
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
