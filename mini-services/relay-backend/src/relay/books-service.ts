import { prisma } from '../prisma';

const DEFAULT_BOOKS = [
  {
    title: 'The Art of War (Excerpt)',
    author: 'Sun Tzu',
    description: 'Classic strategy text. Demo excerpt for in-app reading.',
    language: 'en',
    category: 'Philosophy',
    content:
      '=== CHAPTER 1: Laying Plans ===\n\nAll warfare is based on deception.\n\n=== CHAPTER 2: Waging War ===\n\nIn war, then, let your great object be victory.',
  },
  {
    title: 'Маленький Принц (Фрагмент)',
    author: 'Антуан де Сент-Экзюпери',
    description: 'Короткий демонстрационный фрагмент для библиотеки.',
    language: 'ru',
    category: 'Classic',
    content:
      '=== CHAPTER 1: Пустыня ===\n\nОднажды утром я встретил маленького принца...\n\n=== CHAPTER 2: Лис ===\n\nТы навсегда в ответе за тех, кого приручил.',
  },
];

export async function listBooks(filters?: {
  category?: string;
  language?: string;
  search?: string;
  limit?: number;
}) {
  const where: Record<string, unknown> = { isPublic: true };

  if (filters?.category && filters.category !== 'All') {
    where.category = filters.category;
  }
  if (filters?.language && filters.language !== 'All') {
    where.language = filters.language;
  }
  if (filters?.search) {
    where.OR = [
      { title: { contains: filters.search } },
      { author: { contains: filters.search } },
      { description: { contains: filters.search } },
    ];
  }

  const books = await prisma.book.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(filters?.limit || 50, 100),
  });

  return { books };
}

export async function getBook(id: string) {
  return prisma.book.findUnique({ where: { id } });
}

export async function getBookCategories() {
  const cats = await prisma.book.findMany({
    where: { isPublic: true },
    select: { category: true },
    distinct: ['category'],
  });

  return cats.map((c) => ({
    name: c.category,
    label: c.category,
  }));
}

export function parseChapters(content: string): Array<{
  number: number;
  title: string;
  content: string;
}> {
  const parts = content.split(/=== CHAPTER\s+\d+:\s*/i).filter(Boolean);
  if (parts.length === 0) {
    return [{ number: 1, title: 'Full Text', content: content.trim() }];
  }

  return parts.map((part, idx) => {
    const [rawTitle, ...rest] = part.split('===');
    const body = rest.join('===').trim() || rawTitle.trim();
    const title = rawTitle.split('\n')[0].trim() || `Chapter ${idx + 1}`;
    return {
      number: idx + 1,
      title,
      content: body,
    };
  });
}

export async function getReadingProgress(accountId: string, bookId: string) {
  return prisma.readingProgress.findUnique({
    where: { accountId_bookId: { accountId, bookId } },
  });
}

export async function updateReadingProgress(
  accountId: string,
  bookId: string,
  data: {
    currentChapter?: number;
    scrollPosition?: number;
    percentage?: number;
    bookmarkAdd?: { chapter: number; position: number; label: string };
    bookmarkRemove?: string;
  }
) {
  const existing = await prisma.readingProgress.findUnique({
    where: { accountId_bookId: { accountId, bookId } },
  });

  let bookmarks: Array<{ chapter: number; position: number; label: string }> = [];
  try {
    bookmarks = JSON.parse(existing?.bookmarks || '[]') as typeof bookmarks;
  } catch {
    bookmarks = [];
  }

  if (data.bookmarkAdd && !bookmarks.some((b) => b.label === data.bookmarkAdd?.label)) {
    bookmarks.push(data.bookmarkAdd);
  }

  if (data.bookmarkRemove) {
    bookmarks = bookmarks.filter((b) => b.label !== data.bookmarkRemove);
  }

  return prisma.readingProgress.upsert({
    where: { accountId_bookId: { accountId, bookId } },
    create: {
      accountId,
      bookId,
      currentChapter: data.currentChapter ?? 1,
      scrollPosition: data.scrollPosition ?? 0,
      percentage: data.percentage ?? 0,
      bookmarks: JSON.stringify(bookmarks),
      lastRead: new Date(),
    },
    update: {
      currentChapter: data.currentChapter,
      scrollPosition: data.scrollPosition,
      percentage: data.percentage,
      bookmarks: JSON.stringify(bookmarks),
      lastRead: new Date(),
    },
  });
}

export async function getUserLibrary(accountId: string) {
  const progresses = await prisma.readingProgress.findMany({
    where: { accountId },
    include: { book: true },
    orderBy: { lastRead: 'desc' },
  });

  return progresses.map((p) => ({
    ...p,
    isCompleted: p.percentage >= 95,
    lastReadAt: p.lastRead.toISOString(),
  }));
}

let seeded = false;
export async function seedBooks() {
  if (seeded) return;
  seeded = true;

  const count = await prisma.book.count();
  if (count > 0) return;

  for (const book of DEFAULT_BOOKS) {
    const chapters = parseChapters(book.content);
    await prisma.book.create({
      data: {
        ...book,
        totalChapters: chapters.length,
        totalWords: book.content.split(/\s+/).length,
      },
    });
  }

  console.log(`[BOOKS] Seeded ${DEFAULT_BOOKS.length} demo books`);
}
