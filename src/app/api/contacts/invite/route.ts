import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { rateLimit } from '@/lib/rate-limit';

const inviteSchema = z.object({
  contacts: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        phone: z.string().min(3).max(32).optional(),
        email: z.string().email().optional(),
      }),
    )
    .min(1)
    .max(200),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`contacts:invite:${session.user.id}`, {
      maxRequests: 15,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many invite requests. Please slow down.' }, { status: 429 });
    }

    const parsed = inviteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const invitations = parsed.data.contacts.map((contact) => ({
      name: contact.name,
      phone: contact.phone || null,
      email: contact.email || null,
      status: 'queued' as const,
      queuedAt: new Date().toISOString(),
    }));

    return NextResponse.json({
      success: true,
      invitations,
      message: 'Invitations queued',
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

