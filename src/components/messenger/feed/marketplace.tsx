'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpDown, Heart, Package, Plus, Search, Shield, ShoppingBag, ShoppingCart, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/use-app-store';
import { useMarketplaceStore, type MarketplaceItem } from '@/store/use-marketplace-store';

type MarketplaceTab = 'buy' | 'sell' | 'my';

const FALLBACK_CATEGORIES = [
  'Electronics',
  'Books',
  'Home',
  'Accessories',
  'Services',
  'Clothing',
  'Sports',
  'Auto',
  'Crypto',
];

function money(value: number): string {
  if (value === 0) return '$0';
  return `$${value.toFixed(2).replace(/\.00$/, '')}`;
}

function statusLabel(
  status: MarketplaceItem['status'],
  t: (key: Parameters<ReturnType<typeof useT>['t']>[0]) => string,
): string {
  if (status === 'available') return t('market.available');
  if (status === 'sold') return t('market.sold');
  if (status === 'pending') return t('market.pending');
  return status;
}

export default function MarketplaceScreen() {
  const { t } = useT();
  const goBack = useAppStore((s) => s.goBack);

  const items = useMarketplaceStore((s) => s.items);
  const totalItems = useMarketplaceStore((s) => s.totalItems);
  const categories = useMarketplaceStore((s) => s.categories);
  const searchResults = useMarketplaceStore((s) => s.searchResults);
  const searchTotal = useMarketplaceStore((s) => s.searchTotal);
  const searchSuggestions = useMarketplaceStore((s) => s.searchSuggestions);
  const isSearching = useMarketplaceStore((s) => s.isSearching);
  const activeCategory = useMarketplaceStore((s) => s.activeCategory);
  const activeCondition = useMarketplaceStore((s) => s.activeCondition);
  const activeSort = useMarketplaceStore((s) => s.activeSort);
  const suggestions = useMarketplaceStore((s) => s.suggestions);
  const suggestionsType = useMarketplaceStore((s) => s.suggestionsType);
  const suggestionsSearchHistory = useMarketplaceStore((s) => s.suggestionsSearchHistory);
  const favoriteIds = useMarketplaceStore((s) => s.favoriteIds);
  const myListings = useMarketplaceStore((s) => s.myListings);
  const myListingCounts = useMarketplaceStore((s) => s.myListingCounts);
  const sellerStats = useMarketplaceStore((s) => s.sellerStats);
  const cart = useMarketplaceStore((s) => s.cart);
  const isLoading = useMarketplaceStore((s) => s.isLoading);
  const error = useMarketplaceStore((s) => s.error);

  const setSearchQuery = useMarketplaceStore((s) => s.setSearchQuery);
  const setActiveCategory = useMarketplaceStore((s) => s.setActiveCategory);
  const setActiveCondition = useMarketplaceStore((s) => s.setActiveCondition);
  const setActiveSort = useMarketplaceStore((s) => s.setActiveSort);
  const clearError = useMarketplaceStore((s) => s.clearError);
  const fetchItems = useMarketplaceStore((s) => s.fetchItems);
  const searchItems = useMarketplaceStore((s) => s.searchItems);
  const fetchSearchSuggestions = useMarketplaceStore((s) => s.fetchSearchSuggestions);
  const clearSearchSuggestions = useMarketplaceStore((s) => s.clearSearchSuggestions);
  const fetchCategories = useMarketplaceStore((s) => s.fetchCategories);
  const fetchSuggestions = useMarketplaceStore((s) => s.fetchSuggestions);
  const fetchPriceIndex = useMarketplaceStore((s) => s.fetchPriceIndex);
  const createItem = useMarketplaceStore((s) => s.createItem);
  const purchaseItem = useMarketplaceStore((s) => s.purchaseItem);
  const fetchMyListings = useMarketplaceStore((s) => s.fetchMyListings);
  const fetchSellerStats = useMarketplaceStore((s) => s.fetchSellerStats);
  const toggleFavorite = useMarketplaceStore((s) => s.toggleFavorite);
  const fetchFavorites = useMarketplaceStore((s) => s.fetchFavorites);
  const addToCart = useMarketplaceStore((s) => s.addToCart);
  const removeFromCart = useMarketplaceStore((s) => s.removeFromCart);
  const clearCart = useMarketplaceStore((s) => s.clearCart);

  const [tab, setTab] = useState<MarketplaceTab>('buy');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Electronics');
  const [condition, setCondition] = useState<'new' | 'used'>('used');
  const [imageUrl, setImageUrl] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [priceHints, setPriceHints] = useState<string[]>([]);
  const [suggestedPrice, setSuggestedPrice] = useState<number | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyResult, setBuyResult] = useState<string | null>(null);

  useEffect(() => {
    void fetchCategories();
    void fetchSuggestions();
    void fetchPriceIndex();
    void fetchFavorites();
    void fetchMyListings();
    void fetchSellerStats();
  }, [
    fetchCategories,
    fetchSuggestions,
    fetchPriceIndex,
    fetchFavorites,
    fetchMyListings,
    fetchSellerStats,
  ]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems, activeCategory, activeCondition, activeSort]);

  useEffect(() => {
    setSearchQuery(search);
    const q = search.trim();
    const timer = setTimeout(() => {
      if (q.length >= 2) {
        void searchItems(q);
        void fetchSearchSuggestions(q);
      } else {
        void searchItems('');
        clearSearchSuggestions();
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search, setSearchQuery, searchItems, fetchSearchSuggestions, clearSearchSuggestions]);

  const categoryOptions = useMemo(() => {
    if (categories.length > 0) return categories.map((entry) => entry.name);
    return FALLBACK_CATEGORIES;
  }, [categories]);

  const showSearchResults = search.trim().length >= 2;
  const visibleItems = showSearchResults ? searchResults : items;
  const visibleCount = showSearchResults ? searchTotal : totalItems;
  const cartTotal = useMemo(
    () => cart.reduce((sum, entry) => sum + entry.item.price * entry.quantity, 0),
    [cart],
  );

  const pickSuggestion = (q: string) => {
    setSearch(q);
    setSearchFocused(false);
  };

  const onCreateListing = async () => {
    const parsedPrice = Number(price);
    if (!title.trim() || !description.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setCreateError('Invalid listing fields');
      return;
    }

    setCreating(true);
    setCreateError(null);
    setPriceHints([]);
    setSuggestedPrice(null);

    const result = await createItem({
      title: title.trim(),
      description: description.trim(),
      price: parsedPrice,
      category,
      condition,
      imageUrl: imageUrl.trim() || undefined,
    });

    setCreating(false);

    if (result.error) {
      setCreateError(result.error);
      setPriceHints(result.priceWarnings || []);
      setSuggestedPrice(result.suggestedPrice ?? null);
      return;
    }

    setTitle('');
    setDescription('');
    setPrice('');
    setImageUrl('');
    setPriceHints([]);
    setSuggestedPrice(null);
    await Promise.all([fetchItems(), fetchMyListings(), fetchSellerStats()]);
  };

  const onBuyNow = async (itemId: string) => {
    if (buying) return;
    setBuying(true);
    const result = await purchaseItem(itemId);
    setBuying(false);
    setBuyResult(result.ok ? t('market.purchaseSuccess') : result.error || 'Purchase failed');
    if (result.ok) {
      await Promise.all([fetchItems(), fetchMyListings(), fetchSellerStats()]);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="shrink-0 border-b border-border/50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Button variant="ghost" size="icon" className="size-9" onClick={goBack}>
            <ArrowLeft className="size-5" />
          </Button>
          <ShoppingBag className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">{t('market.title')}</h1>
        </div>
        <Button variant="ghost" size="icon" className="size-9 relative" onClick={() => setCartOpen(true)}>
          <ShoppingCart className="size-4" />
          {cart.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] px-1 flex items-center justify-center">
              {cart.length}
            </span>
          )}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(next) => setTab(next as MarketplaceTab)} className="flex-1 min-h-0 flex flex-col">
        <div className="shrink-0 px-4 pt-3">
          <TabsList className="grid h-9 w-full grid-cols-3">
            <TabsTrigger value="buy">{t('market.buy')}</TabsTrigger>
            <TabsTrigger value="sell">{t('market.sell')}</TabsTrigger>
            <TabsTrigger value="my">{t('market.myItems')}</TabsTrigger>
          </TabsList>
        </div>

        {error && (
          <div className="mt-3 mx-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center gap-2">
            <span className="flex-1">{error}</span>
            <Button variant="ghost" size="icon" className="size-6" onClick={clearError}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}

        <ScrollArea className="flex-1">
          <TabsContent value="buy" className="mt-0 data-[state=inactive]:hidden">
            <div className="space-y-3 p-4 pb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 120)}
                  placeholder={t('market.searchItems')}
                  className="h-9 pl-9 rounded-lg"
                />
                {searchFocused && searchSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-border/60 bg-background shadow-lg overflow-hidden">
                    {searchSuggestions.map((s, idx) => (
                      <button
                        key={`${s.type}-${s.text}-${idx}`}
                        type="button"
                        onClick={() => pickSuggestion(s.text)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{s.text}</span>
                        {s.category && <Badge variant="outline" className="text-[9px]">{s.category}</Badge>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <Button variant={activeCategory === 'All' ? 'default' : 'outline'} size="sm" className="h-7 rounded-full text-xs px-3" onClick={() => setActiveCategory('All')}>
                  {t('market.allCategories')}
                </Button>
                {categoryOptions.map((entry) => (
                  <Button key={entry} variant={activeCategory === entry ? 'default' : 'outline'} size="sm" className="h-7 rounded-full text-xs px-3" onClick={() => setActiveCategory(entry)}>
                    {entry}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Button variant={!activeCondition ? 'default' : 'outline'} size="sm" className="h-7 rounded-full text-xs px-3" onClick={() => setActiveCondition('')}>All</Button>
                <Button variant={activeCondition === 'new' ? 'default' : 'outline'} size="sm" className="h-7 rounded-full text-xs px-3" onClick={() => setActiveCondition('new')}>{t('market.conditionNew')}</Button>
                <Button variant={activeCondition === 'used' ? 'default' : 'outline'} size="sm" className="h-7 rounded-full text-xs px-3" onClick={() => setActiveCondition('used')}>{t('market.conditionUsed')}</Button>
                <div className="ml-auto flex items-center gap-1.5">
                  <ArrowUpDown className="size-3.5 text-muted-foreground" />
                  <select value={activeSort} onChange={(e) => setActiveSort(e.target.value)} className="h-7 rounded-full border border-input bg-background px-2 text-xs outline-none">
                    <option value="newest">Newest</option>
                    <option value="popular">Popular</option>
                    <option value="price_asc">Price ↑</option>
                    <option value="price_desc">Price ↓</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground flex items-start gap-2">
                <Shield className="size-4 mt-0.5 text-emerald-500 shrink-0" />
                <div>
                  <p className="font-medium text-foreground">{t('market.antiSpeculation')}</p>
                  <p>{t('market.maxPriceDesc')}</p>
                </div>
              </div>

              {!showSearchResults && suggestions.length > 0 && (
                <div className="rounded-xl border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{t('market.forYou')} ({suggestionsType})</p>
                  {suggestionsSearchHistory.length > 0 && (
                    <p className="mt-1">History: {suggestionsSearchHistory.slice(0, 3).join(', ')}</p>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground">{visibleCount} {showSearchResults ? t('market.searchResultsFor') : 'listings'}</p>

              {isLoading || isSearching ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[1, 2, 3, 4].map((n) => <div key={n} className="h-52 rounded-xl bg-muted/40 animate-pulse" />)}
                </div>
              ) : visibleItems.length === 0 ? (
                <div className="rounded-xl border border-border/50 bg-muted/30 py-10 text-center">
                  <p className="text-sm font-medium">{t('market.noResults')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('market.noResultsDesc')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {visibleItems.map((entry) => (
                    <button key={entry.id} type="button" onClick={() => setSelectedItem(entry)} className="text-left">
                      <Card className="border-border/50 py-0 overflow-hidden hover:border-border hover:shadow-sm transition-all">
                        <div className="h-32 bg-muted/40 flex items-center justify-center">
                          {entry.imageUrl ? <img src={entry.imageUrl} alt={entry.title} className="h-full w-full object-cover" /> : <Package className="size-8 text-muted-foreground/35" />}
                        </div>
                        <CardContent className="p-3">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium line-clamp-2">{entry.title}</p>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{entry.description}</p>
                            </div>
                            <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={(e) => { e.stopPropagation(); void toggleFavorite(entry.id); }}>
                              <Heart className={cn('size-4', favoriteIds.has(entry.id) && 'fill-rose-500 text-rose-500')} />
                            </Button>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-primary">{entry.price === 0 ? t('market.free') : money(entry.price)}</span>
                            <Badge variant="outline" className="text-[10px]">{statusLabel(entry.status, t)}</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="sell" className="mt-0 data-[state=inactive]:hidden">
            <div className="space-y-3 p-4 pb-6">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Plus className="size-4 text-primary" />
                {t('market.createListing')}
              </div>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('market.listing')} className="h-9" />
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('market.description')} className="min-h-24" />
              <div className="grid grid-cols-2 gap-2">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none">
                  {categoryOptions.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                </select>
                <select value={condition} onChange={(e) => setCondition(e.target.value as 'new' | 'used')} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none">
                  <option value="new">{t('market.conditionNew')}</option>
                  <option value="used">{t('market.conditionUsed')}</option>
                </select>
              </div>
              <Input value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} placeholder={t('market.price')} inputMode="decimal" className="h-9" />
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Image URL (optional)" className="h-9" />
              {(createError || error) && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{createError || error}</div>}
              {suggestedPrice !== null && <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">Suggested price: {money(suggestedPrice)}</div>}
              {priceHints.length > 0 && <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs space-y-1">{priceHints.map((hint, idx) => <p key={`${hint}-${idx}`}>• {hint}</p>)}</div>}
              <Button onClick={() => void onCreateListing()} disabled={creating}>{creating ? '...' : t('market.publish')}</Button>
            </div>
          </TabsContent>

          <TabsContent value="my" className="mt-0 data-[state=inactive]:hidden">
            <div className="space-y-3 p-4 pb-6">
              <div className="grid grid-cols-3 gap-2">
                <Card className="py-0 border-border/50"><CardContent className="p-3 text-center"><p className="text-[11px] text-muted-foreground">{t('market.available')}</p><p className="text-lg font-semibold text-emerald-500">{myListingCounts.available}</p></CardContent></Card>
                <Card className="py-0 border-border/50"><CardContent className="p-3 text-center"><p className="text-[11px] text-muted-foreground">{t('market.sold')}</p><p className="text-lg font-semibold text-primary">{myListingCounts.sold}</p></CardContent></Card>
                <Card className="py-0 border-border/50"><CardContent className="p-3 text-center"><p className="text-[11px] text-muted-foreground">{t('market.pending')}</p><p className="text-lg font-semibold text-amber-500">{myListingCounts.pending}</p></CardContent></Card>
              </div>
              {sellerStats && <div className="rounded-xl border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">Views: {sellerStats.totalViews} · Favorites: {sellerStats.totalFavorites} · Revenue: {money(sellerStats.totalRevenue)}</div>}
              {myListings.length === 0 ? (
                <div className="rounded-xl border border-border/50 bg-muted/30 py-10 text-center"><p className="text-sm">{t('market.noListingsYet')}</p></div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {myListings.map((entry) => (
                    <button key={entry.id} type="button" onClick={() => setSelectedItem(entry)} className="text-left">
                      <Card className="border-border/50 py-0 overflow-hidden">
                        <div className="h-24 bg-muted/40 flex items-center justify-center">{entry.imageUrl ? <img src={entry.imageUrl} alt={entry.title} className="h-full w-full object-cover" /> : <Package className="size-7 text-muted-foreground/35" />}</div>
                        <CardContent className="p-3">
                          <p className="text-sm font-medium line-clamp-2">{entry.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{money(entry.price)}</p>
                        </CardContent>
                      </Card>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          {selectedItem && (
            <>
              <DialogHeader className="px-4 pt-4 pb-2">
                <DialogTitle>{selectedItem.title}</DialogTitle>
                <DialogDescription>{t('market.viewDetails')}</DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[70vh]">
                <div className="space-y-3 px-4 pb-4">
                  <div className="h-44 rounded-xl bg-muted/40 flex items-center justify-center overflow-hidden">
                    {selectedItem.imageUrl ? <img src={selectedItem.imageUrl} alt={selectedItem.title} className="h-full w-full object-cover" /> : <Package className="size-12 text-muted-foreground/35" />}
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedItem.description}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Card className="py-0 border-border/50"><CardContent className="p-3"><p className="text-[11px] text-muted-foreground">{t('market.price')}</p><p className="text-base font-semibold text-primary">{money(selectedItem.price)}</p></CardContent></Card>
                    <Card className="py-0 border-border/50"><CardContent className="p-3"><p className="text-[11px] text-muted-foreground">Ceiling</p><p className="text-base font-semibold">{money(selectedItem.maxPrice)}</p></CardContent></Card>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
                    <p>{t('market.seller')}: {selectedItem.sellerName}</p>
                    {selectedItem.identificationNumber && <p>ID: {selectedItem.identificationNumber}</p>}
                    <p>{t('market.antiSpeculation')}</p>
                  </div>
                  {buyResult && <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-xs">{buyResult}</div>}
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" onClick={() => addToCart(selectedItem)} disabled={selectedItem.status !== 'available'}>{t('market.addToCart')}</Button>
                    <Button variant={favoriteIds.has(selectedItem.id) ? 'default' : 'outline'} onClick={() => void toggleFavorite(selectedItem.id)}>{favoriteIds.has(selectedItem.id) ? t('market.saved') : 'Save'}</Button>
                    <Button onClick={() => void onBuyNow(selectedItem.id)} disabled={buying || selectedItem.status !== 'available'}>{buying ? '...' : t('market.buyNow')}</Button>
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b border-border/50">
            <SheetTitle>{t('market.cart')}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1">
            <div className="space-y-2 p-4">
              {cart.length === 0 ? (
                <div className="rounded-xl border border-border/50 bg-muted/30 py-8 text-center"><p className="text-sm">{t('market.empty')}</p></div>
              ) : (
                cart.map((entry) => (
                  <Card key={entry.item.id} className="py-0 border-border/50">
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="size-12 rounded-lg bg-muted/40 flex items-center justify-center overflow-hidden shrink-0">{entry.item.imageUrl ? <img src={entry.item.imageUrl} alt={entry.item.title} className="w-full h-full object-cover" /> : <Package className="size-5 text-muted-foreground/35" />}</div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium line-clamp-2">{entry.item.title}</p><p className="text-xs text-muted-foreground">x{entry.quantity} · {money(entry.item.price)}</p></div>
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => removeFromCart(entry.item.id)}><Trash2 className="size-4" /></Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
          <div className="border-t border-border/50 p-4 space-y-2">
            <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{t('market.total')}</span><span className="font-semibold">{money(cartTotal)}</span></div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={clearCart} disabled={cart.length === 0}>{t('market.removeFromCart')}</Button>
              <Button onClick={() => setCartOpen(false)}>{t('market.checkout')}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
