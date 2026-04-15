import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { syncUserToRelay } from '@/lib/sync/user-sync';
import { z } from 'zod';

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  username: z.string().min(2).optional(),
  email: z.string().email().optional(),
  bio: z.string().max(500).optional(),
  phone: z.string().optional(),
  birthday: z.string().optional(),
  avatar: z.string().url().optional(),
  status: z.enum(['online', 'away', 'offline']).optional(),
  pinEnabled: z.boolean().optional(),
});

/**
 * GET /api/users/[id] - Get user by ID
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        avatar: true,
        bio: true,
        phone: true,
        birthday: true,
        pinEnabled: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            chatMembers: true,
            aiConversations: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ user });
  } catch (error: unknown) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/users/[id] - Update user
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const patchLimit = rateLimit(`users:update:${session.user.id}`, {
      maxRequests: 20,
      windowMs: 60 * 1000,
    });
    if (!patchLimit.success) {
      return NextResponse.json(
        { error: 'Too many profile update requests. Please try again later.' },
        { status: 429 }
      );
    }

    const { id } = await params;

    // Users can only update their own profile
    if (session.user.id !== id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parseResult = updateUserSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = { ...parseResult.data };
    if (parseResult.data.username !== undefined) {
      updateData.username = parseResult.data.username.replace(/^@+/, '').trim().toLowerCase();
    }
    if (parseResult.data.email !== undefined) {
      updateData.email = parseResult.data.email.trim().toLowerCase();
    }
    if (parseResult.data.phone !== undefined) {
      const normalizedPhone = parseResult.data.phone.replace(/\D/g, '');
      updateData.phone = normalizedPhone.length > 0 ? normalizedPhone : null;
    }

    // Check if username is taken (if being updated)
    if (typeof updateData.username === 'string' && updateData.username.length > 0) {
      const existingUser = await db.user.findFirst({
        where: {
          username: updateData.username,
          id: { not: id },
        },
      });

      if (existingUser) {
        return NextResponse.json(
          { error: 'Username is already taken' },
          { status: 409 }
        );
      }
    }

    if (typeof updateData.email === 'string' && updateData.email.length > 0) {
      const existingEmailUser = await db.user.findFirst({
        where: {
          email: updateData.email,
          id: { not: id },
        },
      });

      if (existingEmailUser) {
        return NextResponse.json(
          { error: 'Email is already in use' },
          { status: 409 }
        );
      }
    }

    const updatedUser = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        username: true,
        avatar: true,
        bio: true,
        phone: true,
        birthday: true,
        pinEnabled: true,
        status: true,
        updatedAt: true,
      },
    });

    if (updatedUser.username) {
      void syncUserToRelay({
        externalId: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        displayName: updatedUser.name,
        source: 'main-app',
      }).catch((err) => console.error('[users:update] Relay sync failed:', err));
    }

    return NextResponse.json({ user: updatedUser });
  } catch (error: unknown) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/users/[id] - Delete user (soft delete)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const deleteLimit = rateLimit(`users:delete:${session.user.id}`, {
      maxRequests: 3,
      windowMs: 60 * 60 * 1000,
    });
    if (!deleteLimit.success) {
      return NextResponse.json(
        { error: 'Too many account delete requests. Please try again later.' },
        { status: 429 }
      );
    }

    const { id } = await params;

    // Users can only delete their own account
    if (session.user.id !== id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Soft delete - update status and clear sensitive data
    await db.user.update({
      where: { id },
      data: {
        status: 'offline',
        name: 'Deleted User',
        email: `deleted-${id}@deleted`,
        avatar: '',
        bio: null,
        phone: null,
        username: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Delete user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

