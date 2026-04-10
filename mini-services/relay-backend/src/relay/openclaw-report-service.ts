import { prisma } from '../prisma';

export interface CreateModerationReportInput {
  accountId: string;
  targetId?: string;
  contextType: string;
  category: string;
  severity: string;
  reason: string;
  metadata?: Record<string, unknown> | null;
}

const VALID_CONTEXT_TYPES = new Set([
  'message',
  'group',
  'channel',
  'marketplace',
  'profile',
  'other',
]);

const VALID_SEVERITY = new Set(['low', 'medium', 'high']);

const VALID_CATEGORIES = new Set([
  'extremism',
  'terrorism',
  'fascism',
  'drug_business',
  'violence',
  'pornography',
  'fraud',
  'banditism',
  'murder',
  'criminal_activity',
  'moderation_error',
]);

export async function createModerationReport(input: CreateModerationReportInput) {
  const contextType = input.contextType.trim().toLowerCase();
  const category = input.category.trim().toLowerCase();
  const severity = input.severity.trim().toLowerCase();
  const reason = input.reason.trim();

  if (!VALID_CONTEXT_TYPES.has(contextType)) {
    return { error: 'Invalid contextType' } as const;
  }
  if (!VALID_CATEGORIES.has(category)) {
    return { error: 'Invalid category' } as const;
  }
  if (!VALID_SEVERITY.has(severity)) {
    return { error: 'Invalid severity' } as const;
  }
  if (reason.length < 3 || reason.length > 500) {
    return { error: 'Invalid reason length' } as const;
  }

  const report = await prisma.moderationReport.create({
    data: {
      accountId: input.accountId,
      targetId: input.targetId || null,
      contextType,
      category,
      severity,
      reason: reason.slice(0, 500),
      metadata:
        input.metadata && Object.keys(input.metadata).length > 0
          ? JSON.stringify(input.metadata).slice(0, 4000)
          : null,
    },
    select: {
      id: true,
      accountId: true,
      targetId: true,
      contextType: true,
      category: true,
      severity: true,
      reason: true,
      metadata: true,
      createdAt: true,
    },
  });

  return { success: true, report } as const;
}

export async function listModerationReports(accountId: string, limit = 50) {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const reports = await prisma.moderationReport.findMany({
    where: { accountId },
    orderBy: { createdAt: 'desc' },
    take: safeLimit,
    select: {
      id: true,
      targetId: true,
      contextType: true,
      category: true,
      severity: true,
      reason: true,
      metadata: true,
      createdAt: true,
    },
  });
  return { reports };
}

export async function getModerationStats(accountId: string, days = 30) {
  const safeDays = Math.min(Math.max(days, 1), 365);
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

  const [total, byCategory, bySeverity] = await Promise.all([
    prisma.moderationReport.count({
      where: {
        accountId,
        createdAt: { gte: since },
      },
    }),
    prisma.moderationReport.groupBy({
      by: ['category'],
      where: {
        accountId,
        createdAt: { gte: since },
      },
      _count: { category: true },
    }),
    prisma.moderationReport.groupBy({
      by: ['severity'],
      where: {
        accountId,
        createdAt: { gte: since },
      },
      _count: { severity: true },
    }),
  ]);

  return {
    rangeDays: safeDays,
    total,
    byCategory: byCategory.map((row) => ({
      category: row.category,
      count: row._count.category,
    })),
    bySeverity: bySeverity.map((row) => ({
      severity: row.severity,
      count: row._count.severity,
    })),
  };
}

