import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const createContactSchema = z.object({
  contactId: z.string().cuid(),
  name: z.string().optional(),
  isFavorite: z.boolean().optional().default(false),
});

/**
 * GET /api/contacts - List user's contacts
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const favoritesOnly = searchParams.get('favorites') === 'true';
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {
      userId: session.user.id,
    };

    if (favoritesOnly) {
      where.isFavorite = true;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contact: { name: { contains: search, mode: 'insensitive' } } },
        { contact: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const contacts = await db.contact.findMany({
      where,
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
      orderBy: [
        { isFavorite: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({
      contacts: contacts.map((c) => ({
        id: c.id,
        contactId: c.contactId,
        customName: c.name,
        isFavorite: c.isFavorite,
        isBlocked: c.isBlocked,
        contact: {
          id: c.contact.id,
          name: c.contact.name,
          email: c.contact.email,
          avatar: c.contact.avatar,
          status: c.contact.status,
          username: c.contact.username,
          displayName: c.name || c.contact.name,
        },
        createdAt: c.createdAt,
      })),
    });
  } catch (error: unknown) {
    console.error('List contacts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/contacts - Add a new contact
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const limit = rateLimit(`contacts:create:${session.user.id}`, {
      maxRequests: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many contact requests. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parseResult = createContactSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { contactId, name, isFavorite } = parseResult.data;

    // Cannot add yourself as a contact
    if (contactId === session.user.id) {
      return NextResponse.json(
        { error: 'Cannot add yourself as a contact' },
        { status: 400 }
      );
    }

    // Check if contact already exists
    const existing = await db.contact.findUnique({
      where: {
        userId_contactId: {
          userId: session.user.id,
          contactId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Contact already exists' },
        { status: 409 }
      );
    }

    // Verify the contact user exists
    const contactUser = await db.user.findUnique({
      where: { id: contactId },
      select: { id: true, email: true, name: true },
    });

    if (!contactUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const contact = await db.contact.create({
      data: {
        userId: session.user.id,
        contactId,
        name: name || null,
        isFavorite,
      },
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

    return NextResponse.json(
      {
        success: true,
        contact: {
          id: contact.id,
          contactId: contact.contactId,
          customName: contact.name,
          isFavorite: contact.isFavorite,
          isBlocked: contact.isBlocked,
          contact: {
            id: contact.contact.id,
            name: contact.contact.name,
            email: contact.contact.email,
            avatar: contact.contact.avatar,
            status: contact.contact.status,
            username: contact.contact.username,
            displayName: contact.name || contact.contact.name,
          },
          createdAt: contact.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Create contact error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

