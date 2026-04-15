import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth-utils';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { syncUserToRelay } from '@/lib/sync/user-sync';

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  username: z.string().trim().min(2, 'Username must be at least 2 characters').optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 registrations per 10 minutes per IP
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';
    const limit = rateLimit(`register:${ip}`, {
      maxRequests: 5,
      windowMs: 10 * 60 * 1000,
    });

    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await request.json();
    const parseResult = registerSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const email = parseResult.data.email.toLowerCase();
    const { password, name } = parseResult.data;
    const normalizedUsername = parseResult.data.username
      ? parseResult.data.username.replace(/^@+/, '').toLowerCase()
      : undefined;

    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Check if username is taken (if provided)
    if (normalizedUsername) {
      const existingUsername = await db.user.findUnique({
        where: { username: normalizedUsername },
      });

      if (existingUsername) {
        return NextResponse.json(
          { error: 'Username is already taken' },
          { status: 409 }
        );
      }
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await db.user.create({
      data: {
        email,
        passwordHash,
        name,
        username: normalizedUsername || null,
        avatar: '',
        status: 'offline',
      },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        avatar: true,
        createdAt: true,
      },
    });

    // Sync user to Relay (non-blocking, fire-and-forget)
    if (user.username) {
      syncUserToRelay({
        externalId: user.id,
        username: user.username,
        email: user.email,
        displayName: user.name,
        source: 'main-app',
      }).catch((err) => console.error('[register] Relay sync failed:', err));
    }

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          avatar: user.avatar,
        },
      },
      { status: 201 }
    );
  } catch {
    // Never leak internal error details to the client
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 });
  }
}
