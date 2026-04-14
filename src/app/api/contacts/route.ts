import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const createContactSchema = z
  .object({
    contactId: z.string().cuid().optional(),
    username: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().trim().min(3).optional(),
    query: z.string().trim().min(1).optional(),
    name: z.string().optional(),
    isFavorite: z.boolean().optional().default(false),
  })
  .refine(
    (value) =>
      Boolean(
        value.contactId ||
          value.username ||
          value.email ||
          value.phone ||
          value.query,
      ),
    {
      message: 'At least one identifier is required',
      path: ['contactId'],
    },
  );

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

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
      const normalizedSearch = search.trim();
      const normalizedUsername = normalizedSearch.replace(/^@+/, '');
      where.OR = [
        { name: { contains: normalizedSearch } },
        { contact: { name: { contains: normalizedSearch } } },
        { contact: { email: { contains: normalizedSearch } } },
        { contact: { username: { contains: normalizedSearch } } },
      ];

      if (normalizedUsername && normalizedUsername !== normalizedSearch) {
        (where.OR as Array<Record<string, unknown>>).push({
          contact: { username: { contains: normalizedUsername } },
        });
      }
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
            phone: true,
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
          phone: c.contact.phone,
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

    const { name, isFavorite, contactId: rawContactId, username, email, phone, query } = parseResult.data;
    const normalizedUsername = username?.replace(/^@+/, '').trim().toLowerCase();
    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedPhone = phone ? normalizePhone(phone) : '';
    const normalizedQuery = query?.trim();

    let contactId = rawContactId;

    if (!contactId) {
      let contactUser = null as
        | {
            id: string;
            email: string;
            name: string;
            username: string | null;
            phone: string | null;
          }
        | null;

      if (normalizedUsername) {
        const usernameCandidates = await db.user.findMany({
          where: {
            id: { not: session.user.id },
            username: { not: null },
          },
          select: {
            id: true,
            email: true,
            name: true,
            username: true,
            phone: true,
          },
          take: 200,
        });
        contactUser =
          usernameCandidates.find(
            (candidate) => (candidate.username || '').toLowerCase() === normalizedUsername,
          ) || null;
      }

      if (!contactUser && normalizedEmail) {
        const emailCandidates = await db.user.findMany({
          where: {
            id: { not: session.user.id },
            email: { not: '' },
          },
          select: {
            id: true,
            email: true,
            name: true,
            username: true,
            phone: true,
          },
          take: 200,
        });
        contactUser =
          emailCandidates.find(
            (candidate) => candidate.email.toLowerCase() === normalizedEmail,
          ) || null;
      }

      if (!contactUser && normalizedPhone) {
        const phoneCandidates = await db.user.findMany({
          where: {
            id: { not: session.user.id },
            phone: { not: null },
          },
          select: {
            id: true,
            email: true,
            name: true,
            username: true,
            phone: true,
          },
          take: 100,
        });

        contactUser =
          phoneCandidates.find((candidate) => normalizePhone(candidate.phone || '') === normalizedPhone) ||
          null;
      }

      if (!contactUser && normalizedQuery) {
        contactUser = await db.user.findFirst({
          where: {
            id: { not: session.user.id },
            OR: [
              { name: { contains: normalizedQuery } },
              { email: { contains: normalizedQuery } },
              { username: { contains: normalizedQuery } },
              { phone: { contains: normalizedQuery } },
            ],
          },
          select: {
            id: true,
            email: true,
            name: true,
            username: true,
            phone: true,
          },
        });
      }

      if (!contactUser) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 },
        );
      }

      contactId = contactUser.id;
    }

    if (!contactId) {
      return NextResponse.json(
        { error: 'Contact target is required' },
        { status: 400 },
      );
    }

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
            phone: true,
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
            phone: contact.contact.phone,
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

