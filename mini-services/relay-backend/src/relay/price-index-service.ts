// ─── Price Index Service ─────────────────────────
// Anti-speculation and anti-dumping price index system
// Uses weighted median (weight by views) for market price determination

import { prisma } from '../prisma';

// ── Calculate Market Price Index ──
// Analyzes all available items in a category to determine fair market price
// Uses weighted median (weight by views = more popular = more authoritative)

export async function calculateMarketPriceIndex(category: string): Promise<{
  marketPrice: number;
  floor: number;          // minimum allowed price (anti-dumping) = marketPrice * 0.65
  ceiling: number;         // maximum allowed price (anti-speculation) = marketPrice * 1.0
  totalListings: number;
  avgPrice: number;
  medianPrice: number;
  minPrice: number;
  maxPrice: number;
}> {
  const items = await prisma.marketplaceItem.findMany({
    where: { category, status: 'available' },
    select: { price: true, views: true },
  });

  if (items.length === 0) {
    // No listings — use default category caps
    const defaults: Record<string, number> = {
      Electronics: 250, Books: 75, Home: 150, Accessories: 100,
      Services: 500, Clothing: 150, Sports: 200, Auto: 2500, Crypto: 5000,
    };
    const def = defaults[category] || 200;
    return {
      marketPrice: def,
      floor: Math.round(def * 0.65 * 100) / 100,
      ceiling: def,
      totalListings: 0,
      avgPrice: def, medianPrice: def, minPrice: def, maxPrice: def,
    };
  }

  // Sort by price for median calculation
  const prices = items.map(i => i.price).sort((a, b) => a - b);
  const views = items.map(i => i.views);

  // Simple average
  const avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length;

  // Weighted median (more views = more weight)
  const totalViews = views.reduce((s, v) => s + v, 0) || 1;
  const weightedItems = items
    .map((item, _i) => ({ price: item.price, weight: item.views / totalViews }))
    .sort((a, b) => a.price - b.price);

  let cumWeight = 0;
  let medianPrice = prices[Math.floor(prices.length / 2)];
  for (const wi of weightedItems) {
    cumWeight += wi.weight;
    if (cumWeight >= 0.5) {
      medianPrice = wi.price;
      break;
    }
  }

  // Market price = weighted median (most resistant to manipulation)
  const marketPrice = Math.round(medianPrice * 100) / 100;

  // Floor: 65% of market price (anti-dumping — can't undercut by more than 35%)
  const floor = Math.round(marketPrice * 0.65 * 100) / 100;

  // Ceiling: 100% of market price (NO inflation allowed, even during shortage)
  const ceiling = marketPrice;

  return {
    marketPrice,
    floor,
    ceiling,
    totalListings: items.length,
    avgPrice: Math.round(avgPrice * 100) / 100,
    medianPrice,
    minPrice: prices[0],
    maxPrice: prices[prices.length - 1],
  };
}

// ── Calculate Full Price Index (all categories) ──

export async function getFullPriceIndex(): Promise<Record<string, {
  marketPrice: number; floor: number; ceiling: number; totalListings: number;
}>> {
  const categories = ['Electronics', 'Books', 'Home', 'Accessories', 'Services', 'Clothing', 'Sports', 'Auto', 'Crypto'];
  const index: Record<string, { marketPrice: number; floor: number; ceiling: number; totalListings: number }> = {};

  for (const cat of categories) {
    const calculated = await calculateMarketPriceIndex(cat);
    index[cat] = {
      marketPrice: calculated.marketPrice,
      floor: calculated.floor,
      ceiling: calculated.ceiling,
      totalListings: calculated.totalListings,
    };
  }

  return index;
}

// ── Validate Price Against Index ──
// Returns { valid, error?, adjustedPrice?, warnings? }

export async function validatePrice(
  category: string,
  price: number,
  _sellerId?: string,
  _existingItemId?: string,  // if editing
  isResale?: boolean,
  originalPurchasePrice?: number,
  daysSincePurchase?: number,
): Promise<{
  valid: boolean;
  error?: string;
  warnings: string[];
  adjustedPrice?: number;
  index: { marketPrice: number; floor: number; ceiling: number };
}> {
  const idx = await calculateMarketPriceIndex(category);
  const warnings: string[] = [];

  // Anti-dumping: can't price below floor (65% of market)
  if (price < idx.floor) {
    return {
      valid: false,
      error: `Price $${price} is below the minimum of $${idx.floor} for ${category}. Price dumping is not allowed.`,
      adjustedPrice: idx.floor,
      warnings: [`Price adjusted to minimum: $${idx.floor}`],
      index: idx,
    };
  }

  // Anti-speculation: can't price above ceiling (market price, NO inflation)
  if (price > idx.ceiling) {
    return {
      valid: false,
      error: `Price $${price} exceeds the market price of $${idx.ceiling} for ${category}. Price inflation is prohibited.`,
      adjustedPrice: idx.ceiling,
      warnings: [`Price capped at market price: $${idx.ceiling}`],
      index: idx,
    };
  }

  // Anti-dropshipping: 8% penalty on quick resale (within 7 days)
  if (isResale && originalPurchasePrice && daysSincePurchase !== undefined && daysSincePurchase < 7) {
    const penaltyRate = 0.08; // 8%
    const maxResalePrice = originalPurchasePrice * (1 - penaltyRate);

    if (price > maxResalePrice) {
      return {
        valid: false,
        error: `Quick resale penalty: items resold within 7 days lose 8% in value. Max resale price: $${Math.round(maxResalePrice * 100) / 100}.`,
        adjustedPrice: Math.round(maxResalePrice * 100) / 100,
        warnings: [`8% quick-resale penalty applied`, `Days since purchase: ${daysSincePurchase}`],
        index: idx,
      };
    }

    warnings.push(`Quick resale: 8% value depreciation applied (resold after ${daysSincePurchase} days)`);
  }

  // General warnings
  if (price >= idx.ceiling * 0.95) {
    warnings.push('Price is near the market ceiling');
  }
  if (price <= idx.floor * 1.1) {
    warnings.push('Price is near the minimum floor');
  }

  return { valid: true, warnings, index: idx };
}

// ── Get User Dropship Score ──
// Tracks how often a user buys and quickly resells

export async function getUserDropshipScore(accountId: string): Promise<{
  score: number;          // 0-100, higher = more suspicious
  totalPurchases: number;
  quickResales: number;
  avgResaleDays: number;
  flagged: boolean;
}> {
  const purchases = await prisma.transaction.findMany({
    where: { buyerId: accountId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  if (purchases.length === 0) {
    return { score: 0, totalPurchases: 0, quickResales: 0, avgResaleDays: 0, flagged: false };
  }

  // Count how many items this user bought and then relisted
  const boughtItemIds = purchases.map(p => p.itemId);
  const relistedItems = await prisma.marketplaceItem.findMany({
    where: {
      previousItemId: { in: boughtItemIds },
      sellerId: accountId,
    },
    select: { previousItemId: true, createdAt: true },
  });

  // Match purchases to resales
  let quickResales = 0;
  let totalResaleDays = 0;
  let resaleCount = 0;

  for (const relist of relistedItems) {
    const purchase = purchases.find(p => p.itemId === relist.previousItemId);
    if (purchase) {
      const days = Math.max(0, Math.floor(
        (relist.createdAt.getTime() - purchase.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      ));
      totalResaleDays += days;
      resaleCount++;
      if (days < 7) quickResales++;
    }
  }

  const score = purchases.length > 0
    ? Math.min(100, Math.round((quickResales / Math.max(1, purchases.length)) * 100))
    : 0;

  return {
    score,
    totalPurchases: purchases.length,
    quickResales,
    avgResaleDays: resaleCount > 0 ? Math.round(totalResaleDays / resaleCount) : 0,
    flagged: score >= 60,
  };
}

// ── Get Item Transaction History ──

export async function getItemHistory(itemId: string): Promise<Array<{
  buyerId: string;
  sellerId: string;
  price: number;
  marketPrice: number;
  resalePenalty: number;
  isResale: boolean;
  dropshipFlag: boolean;
  createdAt: string;
}>> {
  const transactions = await prisma.transaction.findMany({
    where: { itemId },
    orderBy: { createdAt: 'asc' },
  });

  return transactions.map(t => ({
    buyerId: t.buyerId,
    sellerId: t.sellerId,
    price: t.price,
    marketPrice: t.marketPrice,
    resalePenalty: t.resalePenalty,
    isResale: t.isResale,
    dropshipFlag: t.dropshipFlag,
    createdAt: t.createdAt.toISOString(),
  }));
}
