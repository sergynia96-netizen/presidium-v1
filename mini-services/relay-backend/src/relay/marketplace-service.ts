// ─── Marketplace Service ─────────────────────────
// CRUD for marketplace items + search query tracking for OpenClaw
// Enhanced with anti-speculation price index validation

import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { calculateMarketPriceIndex, validatePrice, getUserDropshipScore } from './price-index-service';

// ── Anti-speculation price caps per category ──
const _MAX_PRICES: Record<string, number> = {
  Electronics: 500,
  Books: 150,
  Home: 300,
  Accessories: 200,
  Services: 1000,
  Clothing: 300,
  Sports: 400,
  Auto: 5000,
  Crypto: 10000,
};

const VALID_CATEGORIES = [
  'Electronics', 'Books', 'Home', 'Accessories',
  'Services', 'Clothing', 'Sports', 'Auto', 'Crypto',
];

const VALID_CONDITIONS = ['new', 'used'];
const VALID_STATUSES = ['available', 'sold', 'pending', 'removed'];

// ── List Items (public marketplace feed) ────────

export async function listItems(filters: {
  category?: string;
  condition?: string;
  sellerId?: string;
  status?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}) {
  const where: Prisma.MarketplaceItemWhereInput = {};

  if (filters.category && filters.category !== 'All') {
    where.category = filters.category;
  }
  if (filters.condition) {
    where.condition = filters.condition;
  }
  if (filters.sellerId) {
    where.sellerId = filters.sellerId;
  }
  if (filters.status) {
    where.status = filters.status;
  } else {
    where.status = 'available';
  }

  const orderBy: Prisma.MarketplaceItemOrderByWithRelationInput = {};
  switch (filters.sort) {
    case 'price_asc':
      orderBy.price = 'asc';
      break;
    case 'price_desc':
      orderBy.price = 'desc';
      break;
    case 'popular':
      orderBy.views = 'desc';
      break;
    case 'newest':
    default:
      orderBy.createdAt = 'desc';
      break;
  }

  const take = Math.min(filters.limit || 50, 100);
  const skip = filters.offset || 0;

  const [items, total] = await Promise.all([
    prisma.marketplaceItem.findMany({
      where,
      orderBy,
      take,
      skip,
    }),
    prisma.marketplaceItem.count({ where }),
  ]);

  return { items, total };
}

// ── Get Single Item ─────────────────────────────

export async function getItem(id: string) {
  const item = await prisma.marketplaceItem.findUnique({
    where: { id },
  });
  if (!item) return null;

  // Increment views
  await prisma.marketplaceItem.update({
    where: { id },
    data: { views: { increment: 1 } },
  });

  return { ...item, views: item.views + 1 };
}

// ── Create Item ──────────────────────────────────

export async function createItem(
  sellerId: string,
  sellerName: string,
  data: {
    title: string;
    description: string;
    price: number;
    category: string;
    condition: string;
    imageUrl?: string;
    previousItemId?: string;  // if this is a resale
    originalPurchasePrice?: number;
    daysSincePurchase?: number;
  }
) {
  // Validate
  if (!data.title?.trim()) return { error: 'Title is required' };
  if (!data.description?.trim()) return { error: 'Description is required' };
  if (typeof data.price !== 'number' || data.price < 0) return { error: 'Invalid price' };
  if (!VALID_CATEGORIES.includes(data.category)) return { error: `Invalid category` };
  if (!VALID_CONDITIONS.includes(data.condition)) return { error: 'Condition must be "new" or "used"' };

  const isResale = !!data.previousItemId;

  // ── ANTI-SPECULATION: Validate against Price Index ──
  const priceValidation = await validatePrice(
    data.category,
    data.price,
    sellerId,
    undefined, // no existing item
    isResale,
    data.originalPurchasePrice,
    data.daysSincePurchase,
  );

  if (!priceValidation.valid) {
    return {
      error: priceValidation.error,
      priceWarnings: priceValidation.warnings,
      suggestedPrice: priceValidation.adjustedPrice,
      priceIndex: priceValidation.index,
    };
  }

  // ── ANTI-DROPSHIPPING: Check seller's dropship score ──
  if (isResale) {
    const dropshipScore = await getUserDropshipScore(sellerId);
    if (dropshipScore.flagged) {
      return {
        error: 'Your account has been flagged for excessive dropshipping activity. Resale listing is temporarily restricted.',
        dropshipScore,
      };
    }
  }

  // Build previous owners chain if resale
  let previousOwnerIds = '[]';
  let firstSoldAt: Date | undefined;
  let resaleCount = 0;
  let lastResalePrice: number | undefined;
  let identificationNumber: string | undefined;

  if (data.previousItemId) {
    const originalItem = await prisma.marketplaceItem.findUnique({
      where: { id: data.previousItemId },
    });
    if (originalItem) {
      try {
        const owners = JSON.parse(originalItem.previousOwnerIds || '[]');
        owners.push(originalItem.sellerId);
        previousOwnerIds = JSON.stringify(owners);
      } catch { previousOwnerIds = JSON.stringify([originalItem.sellerId]); }

      firstSoldAt = originalItem.firstSoldAt || originalItem.updatedAt;
      resaleCount = (originalItem.resaleCount || 0) + 1;
      lastResalePrice = originalItem.price;
      identificationNumber = originalItem.identificationNumber ?? undefined;
    }
  }

  // Generate identification number for first-time listings (format: PSD-XXXXXX)
  if (!identificationNumber) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = 'PSD-';
    for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
    identificationNumber = id;
  }

  const item = await prisma.marketplaceItem.create({
    data: {
      sellerId,
      sellerName,
      title: data.title.trim(),
      description: data.description.trim(),
      price: Math.round(data.price * 100) / 100,
      maxPrice: priceValidation.index.ceiling,
      category: data.category,
      condition: data.condition,
      imageUrl: data.imageUrl || null,
      identificationNumber,
      originalPrice: data.originalPurchasePrice || Math.round(data.price * 100) / 100,
      resaleCount,
      firstSoldAt: firstSoldAt ? new Date(firstSoldAt) : null,
      lastResalePrice,
      isResale,
      previousItemId: data.previousItemId || null,
      previousOwnerIds,
    },
  });

  return {
    item,
    priceWarnings: priceValidation.warnings,
    priceIndex: priceValidation.index,
  };
}

// ── Update Item ──────────────────────────────────

export async function updateItem(
  id: string,
  sellerId: string,
  data: Partial<{
    title: string;
    description: string;
    price: number;
    category: string;
    condition: string;
    status: string;
    imageUrl: string;
  }>
) {
  const existing = await prisma.marketplaceItem.findUnique({ where: { id } });
  if (!existing) {
    return { error: 'Item not found' };
  }
  if (existing.sellerId !== sellerId) {
    return { error: 'You can only edit your own listings' };
  }

  // Validate updates
  if (data.category && !VALID_CATEGORIES.includes(data.category)) {
    return { error: `Invalid category` };
  }
  if (data.condition && !VALID_CONDITIONS.includes(data.condition)) {
    return { error: 'Condition must be "new" or "used"' };
  }
  if (data.status && !VALID_STATUSES.includes(data.status)) {
    return { error: `Invalid status` };
  }

  if (data.price !== undefined) {
    const category = data.category || existing.category;
    const priceValidation = await validatePrice(category, data.price, sellerId, id);
    if (!priceValidation.valid) {
      return {
        error: priceValidation.error,
        suggestedPrice: priceValidation.adjustedPrice,
        priceIndex: priceValidation.index,
      };
    }
  }

  const updateData: Prisma.MarketplaceItemUpdateInput = {};
  if (data.title !== undefined) updateData.title = data.title.trim();
  if (data.description !== undefined) updateData.description = data.description.trim();
  if (data.price !== undefined) updateData.price = Math.round(data.price * 100) / 100;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.condition !== undefined) updateData.condition = data.condition;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;

  const item = await prisma.marketplaceItem.update({
    where: { id },
    data: updateData,
  });

  return { item };
}

// ── Delete Item (soft — set status to removed) ─────

export async function deleteItem(id: string, sellerId: string) {
  const existing = await prisma.marketplaceItem.findUnique({ where: { id } });
  if (!existing) {
    return { error: 'Item not found' };
  }
  if (existing.sellerId !== sellerId) {
    return { error: 'You can only delete your own listings' };
  }

  await prisma.marketplaceItem.update({
    where: { id },
    data: { status: 'removed' },
  });

  return { success: true };
}

// ── Search Items ────────────────────────────────

export async function searchItems(
  query: string,
  accountId: string,
  filters?: {
    category?: string;
    condition?: string;
    sort?: string;
  }
) {
  if (!query?.trim() || query.trim().length < 2) {
    return { items: [], total: 0 };
  }

  const q = query.trim().toLowerCase();
  const where: Prisma.MarketplaceItemWhereInput = {
    status: 'available',
    OR: [
      { title: { contains: q } },
      { description: { contains: q } },
      { category: { contains: q } },
    ],
  };

  if (filters?.category && filters.category !== 'All') {
    where.category = filters.category;
  }
  if (filters?.condition) {
    where.condition = filters.condition;
  }

  const orderBy: Prisma.MarketplaceItemOrderByWithRelationInput = {};
  switch (filters?.sort) {
    case 'price_asc': orderBy.price = 'asc'; break;
    case 'price_desc': orderBy.price = 'desc'; break;
    case 'popular': orderBy.views = 'desc'; break;
    default: orderBy.createdAt = 'desc';
  }

  const [items, total] = await Promise.all([
    prisma.marketplaceItem.findMany({
      where,
      orderBy,
      take: 50,
    }),
    prisma.marketplaceItem.count({ where }),
  ]);

  // Track search query for OpenClaw (fire-and-forget)
  prisma.searchQuery.create({
    data: {
      accountId,
      query: q,
      resultsCount: total,
      category: filters?.category,
    },
  }).catch(() => {});

  return { items, total };
}

// ── Track Search (called separately for OpenClaw) ─

export async function trackSearch(accountId: string, query: string, resultsCount: number, category?: string) {
  await prisma.searchQuery.create({
    data: {
      accountId,
      query: query.toLowerCase(),
      resultsCount,
      category,
    },
  }).catch(() => {});
}

// ── Get User's Search History (for OpenClaw) ─

export async function getUserSearchHistory(accountId: string, limit?: number) {
  const searches = await prisma.searchQuery.findMany({
    where: { accountId },
    orderBy: { createdAt: 'desc' },
    take: limit || 20,
    distinct: ['query'],
  });
  return searches;
}

// ── Get Popular Categories (for OpenClaw) ────

export async function getPopularCategories(accountId?: string) {
  const where: Prisma.SearchQueryWhereInput = {};
  if (accountId) {
    where.accountId = accountId;
  }

  const searches = await prisma.searchQuery.groupBy({
    by: ['category'],
    where,
    _sum: { resultsCount: true },
    _count: true,
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });

  return searches
    .filter((s) => s.category)
    .map((s) => ({
      category: s.category,
      searchCount: s._count,
      totalResults: s._sum.resultsCount,
    }));
}

// ── Get Seller Items ────────────────────────────

export async function getSellerItems(sellerId: string) {
  const items = await prisma.marketplaceItem.findMany({
    where: { sellerId, status: { not: 'removed' } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const counts = {
    total: items.length,
    available: items.filter((i) => i.status === 'available').length,
    sold: items.filter((i) => i.status === 'sold').length,
    pending: items.filter((i) => i.status === 'pending').length,
  };

  return { items, counts };
}

// ── Get Categories ──────────────────────────────

export async function getCategories() {
  const cats = ['Electronics', 'Books', 'Home', 'Accessories', 'Services', 'Clothing', 'Sports', 'Auto', 'Crypto'];
  const result: Array<{ name: string; marketPrice: number; floor: number; ceiling: number; totalListings: number }> = [];
  for (const cat of cats) {
    const idx = await calculateMarketPriceIndex(cat);
    result.push({
      name: cat,
      marketPrice: idx.marketPrice,
      floor: idx.floor,
      ceiling: idx.ceiling,
      totalListings: idx.totalListings,
    });
  }
  return result;
}

// ── Toggle Favorite ─────────────────────────────

export async function toggleFavorite(accountId: string, itemId: string) {
  const existing = await prisma.favorite.findUnique({
    where: { accountId_itemId: { accountId, itemId } },
  });

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    await prisma.marketplaceItem.update({
      where: { id: itemId },
      data: { favorites: { decrement: 1 } },
    });
    return { favorited: false };
  } else {
    await prisma.favorite.create({ data: { accountId, itemId } });
    await prisma.marketplaceItem.update({
      where: { id: itemId },
      data: { favorites: { increment: 1 } },
    });
    return { favorited: true };
  }
}

// ── Get User Favorites ──────────────────────────

export async function getUserFavorites(accountId: string) {
  const favs = await prisma.favorite.findMany({
    where: { accountId },
    include: { item: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return favs.map(f => ({ ...f.item, isFavorited: true }));
}

// ── Check if items are favorited by user ────────

export async function checkFavorites(accountId: string, itemIds: string[]) {
  if (itemIds.length === 0) return new Set<string>();
  const favs = await prisma.favorite.findMany({
    where: { accountId, itemId: { in: itemIds } },
    select: { itemId: true },
  });
  return new Set(favs.map(f => f.itemId));
}

// ── Get Seller Stats ────────────────────────────

export async function getSellerStats(sellerId: string) {
  const items = await prisma.marketplaceItem.findMany({
    where: { sellerId },
  });
  return {
    totalItems: items.length,
    activeItems: items.filter(i => i.status === 'available').length,
    soldItems: items.filter(i => i.status === 'sold').length,
    totalViews: items.reduce((sum, i) => sum + i.views, 0),
    totalFavorites: items.reduce((sum, i) => sum + i.favorites, 0),
    totalRevenue: items.filter(i => i.status === 'sold').reduce((sum, i) => sum + i.price, 0),
  };
}

// ── Purchase Item (create order, mark as sold) ──

export async function purchaseItem(itemId: string, buyerId: string) {
  const item = await prisma.marketplaceItem.findUnique({ where: { id: itemId } });
  if (!item) return { error: 'Item not found' };
  if (item.sellerId === buyerId) return { error: 'Cannot buy your own item' };
  if (item.status !== 'available') return { error: 'Item is no longer available' };

  // ── Get market price at time of transaction ──
  const priceIndex = await calculateMarketPriceIndex(item.category);

  // ── Check if this buyer is the previous owner (circular resale) ──
  let previousOwners: string[] = [];
  try { previousOwners = JSON.parse(item.previousOwnerIds || '[]'); } catch { /* ignore malformed owner history */ }
  if (previousOwners.includes(buyerId)) {
    return { error: 'You have already owned this item. Circular resale is not allowed.' };
  }

  // ── Calculate transaction metadata ──
  const isResale = item.isResale || item.resaleCount > 0;
  const priceDeviation = priceIndex.marketPrice > 0
    ? Math.round(((item.price - priceIndex.marketPrice) / priceIndex.marketPrice) * 10000) / 100
    : 0;

  // ── Mark item as sold ──
  const updated = await prisma.marketplaceItem.update({
    where: { id: itemId },
    data: {
      status: 'sold',
      firstSoldAt: item.firstSoldAt || new Date(),
    },
  });

  // ── Create transaction record ──
  await prisma.transaction.create({
    data: {
      itemId,
      buyerId,
      sellerId: item.sellerId,
      price: item.price,
      marketPrice: priceIndex.marketPrice,
      category: item.category,
      identificationNumber: item.identificationNumber,
      isResale,
      resalePenalty: 0,
      priceDeviation,
      dropshipFlag: false, // will be updated by background analysis
    },
  });

  // ── Background: check for dropshipping pattern ──
  getUserDropshipScore(buyerId).then(score => {
    if (score.flagged) {
      // Mark the transaction as suspicious
      prisma.transaction.updateMany({
        where: { buyerId, itemId },
        data: { dropshipFlag: true },
      }).catch(() => {});
    }
  }).catch(() => {});

  return {
    item: updated,
    transaction: {
      identificationNumber: item.identificationNumber,
      marketPrice: priceIndex.marketPrice,
      priceDeviation,
    },
  };
}

// ── Get AI-Powered Suggestions (uses recent search history) ──

export async function getSmartSuggestions(accountId: string) {
  // Get recent search queries from this user
  const recentSearches = await prisma.searchQuery.findMany({
    where: { accountId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    distinct: ['query'],
  });

  if (recentSearches.length === 0) {
    // No search history — return trending items
    const trending = await prisma.marketplaceItem.findMany({
      where: { status: 'available' },
      orderBy: { views: 'desc' },
      take: 6,
    });
    return {
      type: 'trending' as const,
      items: trending,
      searchHistory: [],
    };
  }

  // Extract unique search terms and categories
  const queries = recentSearches.map(s => s.query);
  const categories = [...new Set(recentSearches.flatMap((s) => (s.category ? [s.category] : [])))];

  // Find items matching recent search patterns
  const searchPatterns = queries.slice(0, 5).map(q => ({
    title: { contains: q },
  }));
  const categoryPatterns = categories.slice(0, 3).map(c => ({
    category: c,
  }));

  const suggestedItems = await prisma.marketplaceItem.findMany({
    where: {
      status: 'available',
      OR: [
        ...searchPatterns,
        ...categoryPatterns,
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });

  return {
    type: 'personalized' as const,
    items: suggestedItems,
    searchHistory: queries,
    categories,
  };
}

// ── Get Search Suggestions (autocomplete) ───────

export async function getSearchSuggestions(query: string, accountId?: string) {
  if (!query || query.length < 2) return { suggestions: [] };

  const q = query.toLowerCase();

  // Get matching titles from existing items
  const items = await prisma.marketplaceItem.findMany({
    where: {
      status: 'available',
      OR: [
        { title: { contains: q } },
        { category: { contains: q } },
      ],
    },
    select: { title: true, category: true },
    take: 5,
  });

  // Get matching search history for this user
  let historySuggestions: string[] = [];
  if (accountId) {
    const history = await prisma.searchQuery.findMany({
      where: {
        accountId,
        query: { contains: q },
      },
      select: { query: true },
      distinct: ['query'],
      take: 3,
      orderBy: { createdAt: 'desc' },
    });
    historySuggestions = history.map(h => h.query);
  }

  return {
    suggestions: [
      ...historySuggestions.map(s => ({ type: 'history' as const, text: s })),
      ...items.map(i => ({ type: 'item' as const, text: i.title, category: i.category })),
    ].slice(0, 8),
  };
}
