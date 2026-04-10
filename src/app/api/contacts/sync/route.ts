import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

const syncContactsSchema = z.object({
  phoneNumbers: z.array(z.string().min(3).max(32)).min(1).max(500),
});

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, '').trim();
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`contacts:sync:${session.user.id}`, {
      maxRequests: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many sync requests. Please slow down.' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = syncContactsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const normalizedToOriginal = new Map<string, string>();
    for (const phone of parsed.data.phoneNumbers) {
      const normalized = normalizePhone(phone);
      if (normalized.length > 0 && !normalizedToOriginal.has(normalized)) {
        normalizedToOriginal.set(normalized, phone);
      }
    }

    const users = await db.user.findMany({
      where: {
        phone: {
          not: null,
        },
      },
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

    const found: Array<{ phone: string; userId: string; name: string }> = [];
    const matched = new Set<string>();

    for (const user of users) {
      const normalizedUserPhone = normalizePhone(user.phone || '');
      if (!normalizedUserPhone) continue;
      const originalPhone = normalizedToOriginal.get(normalizedUserPhone);
      if (!originalPhone) continue;
      matched.add(normalizedUserPhone);
      found.push({
        phone: originalPhone,
        userId: user.id,
        name: user.name,
      });
    }

    const notFound = Array.from(normalizedToOriginal.entries())
      .filter(([normalized]) => !matched.has(normalized))
      .map(([, original]) => original);

    return NextResponse.json({
      found,
      notFound,
      count: {
        found: found.length,
        notFound: notFound.length,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

