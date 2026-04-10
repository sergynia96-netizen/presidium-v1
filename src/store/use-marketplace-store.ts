import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getRelayAuthHeaders } from '@/lib/relay-auth';

export interface MarketplaceItem {
  id: string;
  sellerId: string;
  sellerName: string;
  title: string;
  description: string;
  price: number;
  maxPrice: number;
  category: string;
  condition: 'new' | 'used';
  status: 'available' | 'sold' | 'pending' | 'removed';
  imageUrl: string | null;
  views: number;
  favorites: number;
  identificationNumber?: string | null;
  isResale?: boolean;
  resaleCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  item: MarketplaceItem;
  quantity: number;
}

interface SellerStats {
  totalItems: number;
  activeItems: number;
  soldItems: number;
  totalViews: number;
  totalFavorites: number;
  totalRevenue: number;
}

interface PriceIndexItem {
  marketPrice: number;
  floor: number;
  ceiling: number;
  totalListings: number;
}

interface OpenClawFlag {
  category: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

interface OpenClawModerationResponse {
  success?: boolean;
  blocked?: boolean;
  flags?: OpenClawFlag[];
  warning?: string | null;
  suggestion?: string | null;
  suggestedAction?: string | null;
  riskLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

interface MarketplaceState {
  items: MarketplaceItem[];
  totalItems: number;
  categories: Array<{ name: string; marketPrice: number; floor: number; ceiling: number; totalListings: number }>;

  searchQuery: string;
  searchResults: MarketplaceItem[];
  searchTotal: number;
  searchSuggestions: Array<{ type: 'history' | 'item'; text: string; category?: string }>;
  isSearching: boolean;

  activeCategory: string;
  activeCondition: string;
  activeSort: string;

  suggestions: MarketplaceItem[];
  suggestionsType: 'personalized' | 'trending' | 'none';
  suggestionsSearchHistory: string[];

  favoriteIds: Set<string>;

  myListings: MarketplaceItem[];
  myListingCounts: { total: number; available: number; sold: number; pending: number };
  sellerStats: SellerStats | null;

  cart: CartItem[];
  selectedItem: MarketplaceItem | null;
  priceIndexByCategory: Record<string, PriceIndexItem>;

  isLoading: boolean;
  error: string | null;

  setSearchQuery: (q: string) => void;
  setActiveCategory: (cat: string) => void;
  setActiveCondition: (condition: string) => void;
  setActiveSort: (sort: string) => void;
  clearError: () => void;

  fetchItems: () => Promise<void>;
  searchItems: (q?: string) => Promise<void>;
  fetchSearchSuggestions: (q: string) => Promise<void>;
  clearSearchSuggestions: () => void;
  fetchCategories: () => Promise<void>;
  fetchSuggestions: () => Promise<void>;
  fetchPriceIndex: () => Promise<void>;

  createItem: (data: {
    title: string;
    description: string;
    price: number;
    category: string;
    condition: 'new' | 'used';
    imageUrl?: string;
    previousItemId?: string;
    originalPurchasePrice?: number;
    daysSincePurchase?: number;
  }) => Promise<{ item?: MarketplaceItem; error?: string; suggestedPrice?: number; priceWarnings?: string[] }>;
  purchaseItem: (itemId: string) => Promise<{ ok: boolean; error?: string }>;
  fetchMyListings: () => Promise<void>;
  fetchSellerStats: () => Promise<void>;
  toggleFavorite: (itemId: string) => Promise<boolean>;
  fetchFavorites: () => Promise<void>;

  addToCart: (item: MarketplaceItem) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  selectItem: (item: MarketplaceItem | null) => void;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  auth = false,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };

  if (auth) {
    Object.assign(headers, getRelayAuthHeaders());
  }

  const res = await fetch(`/api/proxy${path}`, {
    ...init,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`);
  }
  return data as T;
}

async function moderateWithOpenClaw(text: string, context: string[] = []): Promise<{
  blocked: boolean;
  reason: string | null;
  suggestion: string | null;
}> {
  try {
    const res = await fetch('/api/openclaw/moderate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        chatContext: context,
      }),
    });

    if (!res.ok) {
      return { blocked: false, reason: null, suggestion: null };
    }

    const data = (await res.json()) as OpenClawModerationResponse;
    const flags = data.flags || [];
    const blocked = Boolean(
      data.blocked ||
        data.riskLevel === 'high' ||
        data.riskLevel === 'critical' ||
        flags.some((f) => f.severity === 'high'),
    );

    const reason =
      data.warning ||
      flags[0]?.description ||
      (blocked ? 'Blocked by OpenClaw moderation policy.' : null);
    const suggestion = data.suggestion ?? data.suggestedAction ?? null;

    return { blocked, reason, suggestion };
  } catch {
    return { blocked: false, reason: null, suggestion: null };
  }
}

export const useMarketplaceStore = create<MarketplaceState>()(
  persist(
    (set, get) => ({
      items: [],
      totalItems: 0,
      categories: [],

      searchQuery: '',
      searchResults: [],
      searchTotal: 0,
      searchSuggestions: [],
      isSearching: false,

      activeCategory: 'All',
      activeCondition: '',
      activeSort: 'newest',

      suggestions: [],
      suggestionsType: 'none',
      suggestionsSearchHistory: [],

      favoriteIds: new Set<string>(),
      myListings: [],
      myListingCounts: { total: 0, available: 0, sold: 0, pending: 0 },
      sellerStats: null,
      cart: [],
      selectedItem: null,
      priceIndexByCategory: {},

      isLoading: false,
      error: null,

      setSearchQuery: (q) => set({ searchQuery: q }),
      setActiveCategory: (cat) => set({ activeCategory: cat }),
      setActiveCondition: (condition) => set({ activeCondition: condition }),
      setActiveSort: (sort) => set({ activeSort: sort }),
      clearError: () => set({ error: null }),

      fetchItems: async () => {
        set({ isLoading: true, error: null });
        try {
          const params = new URLSearchParams();
          if (get().activeCategory !== 'All') params.set('category', get().activeCategory);
          if (get().activeCondition) params.set('condition', get().activeCondition);
          params.set('sort', get().activeSort || 'newest');
          params.set('limit', '60');

          const data = await request<{ items: MarketplaceItem[]; total: number }>(
            `/marketplace/items?${params.toString()}`,
          );
          set({ items: data.items || [], totalItems: data.total || 0, isLoading: false });
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Failed to load marketplace',
          });
        }
      },

      searchItems: async (q) => {
        const query = (q ?? get().searchQuery).trim();
        if (query.length < 2) {
          set({ searchResults: [], searchTotal: 0, isSearching: false });
          return;
        }
        set({ isSearching: true, error: null });
        try {
          const moderation = await moderateWithOpenClaw(query);
          if (moderation.blocked) {
            set({
              searchResults: [],
              searchTotal: 0,
              isSearching: false,
              error: moderation.reason || 'Search query blocked by OpenClaw',
            });
            return;
          }

          const params = new URLSearchParams();
          params.set('q', query);
          if (get().activeCategory !== 'All') params.set('category', get().activeCategory);
          if (get().activeCondition) params.set('condition', get().activeCondition);
          params.set('sort', get().activeSort || 'newest');

          const data = await request<{ items: MarketplaceItem[]; total: number }>(
            `/marketplace/search?${params.toString()}`,
            {},
            true,
          );

          set({
            searchResults: data.items || [],
            searchTotal: data.total || 0,
            searchQuery: query,
            isSearching: false,
          });
        } catch (err) {
          set({
            isSearching: false,
            error: err instanceof Error ? err.message : 'Search failed',
          });
        }
      },

      fetchSearchSuggestions: async (q) => {
        if (!q || q.trim().length < 2) {
          set({ searchSuggestions: [] });
          return;
        }
        try {
          const data = await request<{ suggestions: Array<{ type: 'history' | 'item'; text: string; category?: string }> }>(
            `/marketplace/search/suggestions?q=${encodeURIComponent(q.trim())}`,
            {},
            false,
          );
          set({ searchSuggestions: data.suggestions || [] });
        } catch {
          set({ searchSuggestions: [] });
        }
      },

      clearSearchSuggestions: () => set({ searchSuggestions: [] }),

      fetchCategories: async () => {
        try {
          const data = await request<{
            categories: Array<{ name: string; marketPrice: number; floor: number; ceiling: number; totalListings: number }>;
          }>('/marketplace/categories');
          set({ categories: data.categories || [] });
        } catch {
          // noop
        }
      },

      fetchSuggestions: async () => {
        try {
          const data = await request<{
            type: 'personalized' | 'trending';
            items: MarketplaceItem[];
            searchHistory: string[];
          }>('/marketplace/suggestions', {}, true);

          set({
            suggestions: data.items || [],
            suggestionsType: data.type || 'none',
            suggestionsSearchHistory: data.searchHistory || [],
          });
        } catch {
          set({ suggestions: [], suggestionsType: 'none', suggestionsSearchHistory: [] });
        }
      },

      fetchPriceIndex: async () => {
        try {
          const data = await request<{
            index: Record<string, PriceIndexItem>;
          }>('/marketplace/price-index');
          set({ priceIndexByCategory: data.index || {} });
        } catch {
          // noop
        }
      },

      createItem: async (payload) => {
        set({ error: null });
        try {
          const moderation = await moderateWithOpenClaw(`${payload.title}\n${payload.description}`);
          if (moderation.blocked) {
            const error = moderation.reason || 'Listing blocked by OpenClaw moderation';
            set({ error });
            return {
              error,
              priceWarnings: moderation.suggestion ? [moderation.suggestion] : ['Please remove prohibited content and try again.'],
            };
          }

          const data = await request<{
            item?: MarketplaceItem;
            error?: string;
            suggestedPrice?: number;
            priceWarnings?: string[];
          }>(
            '/marketplace/items',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            },
            true,
          );

          if (data.error) {
            set({ error: data.error });
            return { error: data.error, suggestedPrice: data.suggestedPrice, priceWarnings: data.priceWarnings };
          }

          await Promise.all([get().fetchItems(), get().fetchMyListings()]);
          return { item: data.item };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Failed to create item';
          set({ error });
          return { error };
        }
      },

      purchaseItem: async (itemId) => {
        try {
          const data = await request<{ error?: string }>(
            `/marketplace/items/${itemId}/purchase`,
            { method: 'POST' },
            true,
          );
          if (data.error) {
            return { ok: false, error: data.error };
          }
          await Promise.all([get().fetchItems(), get().fetchMyListings(), get().fetchSellerStats()]);
          return { ok: true };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : 'Purchase failed' };
        }
      },

      fetchMyListings: async () => {
        try {
          const data = await request<{
            items: MarketplaceItem[];
            counts: { total: number; available: number; sold: number; pending: number };
          }>('/marketplace/seller/items', {}, true);
          set({
            myListings: data.items || [],
            myListingCounts: data.counts || { total: 0, available: 0, sold: 0, pending: 0 },
          });
        } catch {
          set({ myListings: [], myListingCounts: { total: 0, available: 0, sold: 0, pending: 0 } });
        }
      },

      fetchSellerStats: async () => {
        try {
          const data = await request<{ stats: SellerStats }>('/marketplace/seller/stats', {}, true);
          set({ sellerStats: data.stats || null });
        } catch {
          set({ sellerStats: null });
        }
      },

      toggleFavorite: async (itemId) => {
        try {
          const data = await request<{ favorited: boolean }>(
            `/marketplace/items/${itemId}/favorite`,
            { method: 'POST' },
            true,
          );
          set((state) => {
            const next = new Set(state.favoriteIds);
            if (data.favorited) next.add(itemId);
            else next.delete(itemId);
            return { favoriteIds: next };
          });
          return data.favorited;
        } catch {
          return false;
        }
      },

      fetchFavorites: async () => {
        try {
          const data = await request<{ items: MarketplaceItem[] }>('/marketplace/favorites', {}, true);
          set({ favoriteIds: new Set((data.items || []).map((i) => i.id)) });
        } catch {
          set({ favoriteIds: new Set<string>() });
        }
      },

      addToCart: (item) =>
        set((state) => {
          const existing = state.cart.find((c) => c.item.id === item.id);
          if (existing) {
            return {
              cart: state.cart.map((c) =>
                c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c,
              ),
            };
          }
          return { cart: [...state.cart, { item, quantity: 1 }] };
        }),

      removeFromCart: (itemId) =>
        set((state) => ({
          cart: state.cart.filter((c) => c.item.id !== itemId),
        })),

      clearCart: () => set({ cart: [] }),
      selectItem: (item) => set({ selectedItem: item }),
    }),
    {
      name: 'presidium-marketplace',
      partialize: (state) => ({
        cart: state.cart,
        activeCategory: state.activeCategory,
        activeCondition: state.activeCondition,
        activeSort: state.activeSort,
        favoriteIds: Array.from(state.favoriteIds),
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<MarketplaceState>),
        favoriteIds: new Set((persisted as { favoriteIds?: string[] })?.favoriteIds || []),
      }),
    },
  ),
);
