import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const updateContactSchema = z.object({
  name: z.string().optional(),
  isFavorite: z.boolean().optional(),
  isBlocked: z.boolean().optional(),
});

/**
 * PATCH /api/contacts/[id] - Update contact
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

    const patchLimit = rateLimit(`contacts:update:${session.user.id}`, {
      maxRequests: 60,
      windowMs: 60 * 1000,
    });
    if (!patchLimit.success) {
      return NextResponse.json(
        { error: 'Too many contact updates. Please slow down.' },
        { status: 429 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const parseResult = updateContactSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { name, isFavorite, isBlocked } = parseResult.data;

    const contact = await db.contact.findUnique({
      where: { id },
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },
      },
    });

    if (!contact) {
      return NextResponse.json(
        { error: 'Contact not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (contact.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      updateData.name = name || null;
    }
    if (isFavorite !== undefined) {
      updateData.isFavorite = isFavorite;
    }
    if (isBlocked !== undefined) {
      updateData.isBlocked = isBlocked;
    }

    const updatedContact = await db.contact.update({
      where: { id },
      data: updateData,
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
            username: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      contact: {
        id: updatedContact.id,
        contactId: updatedContact.contactId,
        customName: updatedContact.name,
        isFavorite: updatedContact.isFavorite,
        isBlocked: updatedContact.isBlocked,
        contact: {
          id: updatedContact.contact.id,
          name: updatedContact.contact.name,
          email: updatedContact.contact.email,
          avatar: updatedContact.contact.avatar,
          status: updatedContact.contact.status,
          username: updatedContact.contact.username,
          displayName: updatedContact.name || updatedContact.contact.name,
        },
        createdAt: updatedContact.createdAt,
        updatedAt: updatedContact.updatedAt,
      },
    });
  } catch (error: unknown) {
    console.error('Update contact error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/contacts/[id] - Delete contact
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

    const deleteLimit = rateLimit(`contacts:delete:${session.user.id}`, {
      maxRequests: 40,
      windowMs: 60 * 1000,
    });
    if (!deleteLimit.success) {
      return NextResponse.json(
        { error: 'Too many contact delete requests. Please slow down.' },
        { status: 429 }
      );
    }

    const { id } = await params;

    const contact = await db.contact.findUnique({
      where: { id },
    });

    if (!contact) {
      return NextResponse.json(
        { error: 'Contact not found' },
        { status: 404 }
      );
    }

    // Verify ownership
    if (contact.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    await db.contact.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Contact deleted',
    });
  } catch (error: unknown) {
    console.error('Delete contact error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

