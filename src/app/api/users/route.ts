import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { z } from 'zod';

const querySchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
  search: z.string().optional(),
  status: z.string().optional(),
});

/**
 * GET /api/users - List users with pagination and filtering
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
    const parseResult = querySchema.safeParse(Object.fromEntries(searchParams));

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { page, limit, search, status } = parseResult.data;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (search) {
      const normalizedSearch = search.trim();
      const normalizedUsername = normalizedSearch.replace(/^@+/, '');
      where.OR = [
        { name: { contains: normalizedSearch } },
        { email: { contains: normalizedSearch } },
        { username: { contains: normalizedSearch } },
        { phone: { contains: normalizedSearch } },
      ];

      if (normalizedUsername && normalizedUsername !== normalizedSearch) {
        (where.OR as Array<Record<string, unknown>>).push({
          username: { contains: normalizedUsername },
        });
      }
    }

    if (status && ['online', 'away', 'offline'].includes(status)) {
      where.status = status;
    }

    // Exclude current user from results
    where.id = { not: session.user.id };

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          username: true,
          phone: true,
          avatar: true,
          status: true,
          bio: true,
          createdAt: true,
        },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasMore: skip + users.length < total,
      },
    });
  } catch (error: unknown) {
    console.error('List users error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

