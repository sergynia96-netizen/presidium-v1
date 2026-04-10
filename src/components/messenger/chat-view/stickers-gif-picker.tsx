/**
 * Stickers and GIF Picker
 *
 * Features:
 * - Sticker packs browsing
 * - Sticker search
 * - Sticker suggestions (based on context)
 * - GIF search via Tenor/Giphy API
 * - Recently used stickers
 * - Favorite stickers
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Heart, Clock, X, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Sticker {
  id: string;
  packId: string;
  packName: string;
  url: string; // URL or base64
  emoji: string; // Associated emoji for search
  tags: string[];
  isFavorite: boolean;
}

export interface StickerPack {
  id: string;
  name: string;
  creator: string;
  stickerCount: number;
  previewUrl: string;
  isInstalled: boolean;
  isBuiltIn: boolean;
}

export interface GIFResult {
  id: string;
  url: string;
  previewUrl: string;
  title: string;
  width: number;
  height: number;
}

// ─── Built-in Sticker Catalog (Local) ───────────────────────────────────────

const BUILTIN_STICKER_PACKS: StickerPack[] = [
  { id: 'pack-1', name: 'Presidium Cats', creator: 'Presidium', stickerCount: 24, previewUrl: '', isInstalled: true, isBuiltIn: true },
  { id: 'pack-2', name: 'Emoji Reactions', creator: 'Presidium', stickerCount: 32, previewUrl: '', isInstalled: true, isBuiltIn: true },
  { id: 'pack-3', name: 'Cool Animals', creator: 'Community', stickerCount: 18, previewUrl: '', isInstalled: false, isBuiltIn: false },
  { id: 'pack-4', name: 'Work Life', creator: 'Presidium', stickerCount: 20, previewUrl: '', isInstalled: false, isBuiltIn: false },
];

const BUILTIN_STICKERS: Sticker[] = Array.from({ length: 24 }, (_, i) => ({
  id: `sticker-${i}`,
  packId: i < 12 ? 'pack-1' : 'pack-2',
  packName: i < 12 ? 'Presidium Cats' : 'Emoji Reactions',
  url: '',
  emoji: ['😀', '😂', '❤️', '🔥', '👍', '😎', '🎉', '🤔', '😢', '👋', '🙌', '💪'][i % 12],
  tags: ['emoji', 'reaction', 'mood'],
  isFavorite: i < 4,
}));

// ─── Sticker Picker ─────────────────────────────────────────────────────────

interface StickerPickerProps {
  onSelect: (sticker: Sticker) => void;
  onClose: () => void;
  className?: string;
}

export function StickerPicker({ onSelect, onClose, className }: StickerPickerProps) {
  const { t, tf } = useT();
  const [activeTab, setActiveTab] = useState<'recent' | 'favorites' | 'packs' | 'search'>('recent');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPack, setSelectedPack] = useState<string | null>(null);

  const filteredStickers = useMemo(() => {
    let stickers = BUILTIN_STICKERS;

    if (activeTab === 'recent') {
      stickers = stickers.slice(0, 12);
    } else if (activeTab === 'favorites') {
      stickers = stickers.filter(s => s.isFavorite);
    } else if (selectedPack) {
      stickers = stickers.filter(s => s.packId === selectedPack);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      stickers = stickers.filter(
        s => s.emoji.includes(q) || s.tags.some(t => t.includes(q)) || s.packName.toLowerCase().includes(q),
      );
    }

    return stickers;
  }, [activeTab, searchQuery, selectedPack]);

  return (
    <div className={cn('w-80 bg-background border border-border/50 rounded-t-xl shadow-xl flex flex-col max-h-96', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <Search className="size-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (e.target.value) setActiveTab('search');
          }}
          placeholder={t('chat.stickerSearchPlaceholder')}
          className="h-7 text-sm border-0 focus-visible:ring-0 px-0 bg-transparent"
        />
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-3 py-1.5 border-b border-border/50">
        {[
          { id: 'recent' as const, icon: Clock, label: t('chat.stickersRecent') },
          { id: 'favorites' as const, icon: Heart, label: t('chat.stickersFavorites') },
          { id: 'packs' as const, icon: Sparkles, label: t('chat.stickersPacks') },
        ].map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => { setActiveTab(id); setSelectedPack(null); }}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors',
              activeTab === id
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {activeTab === 'packs' && !selectedPack ? (
          <div className="grid grid-cols-2 gap-2 p-3">
            {BUILTIN_STICKER_PACKS.map((pack) => (
              <button
                key={pack.id}
                onClick={() => setSelectedPack(pack.id)}
                className="flex flex-col items-center gap-1 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="size-12 rounded-lg bg-gradient-to-br from-emerald-brand/20 to-cyan-400/20 flex items-center justify-center text-2xl">
                  {pack.isBuiltIn ? '🐱' : '🎨'}
                </div>
                <span className="text-xs font-medium truncate w-full text-center">{pack.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {tf('chat.stickerCount', { count: String(pack.stickerCount) })}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-1 p-2">
            {filteredStickers.map((sticker) => (
              <button
                key={sticker.id}
                onClick={() => onSelect(sticker)}
                className="flex items-center justify-center aspect-square rounded-lg hover:bg-muted transition-colors text-2xl"
              >
                {sticker.emoji}
              </button>
            ))}
          </div>
        )}

        {filteredStickers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Search className="size-8 mb-2 opacity-50" />
            <p className="text-sm">{t('chat.stickersNothingFound')}</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ─── GIF Picker ──────────────────────────────────────────────────────────────

interface GIFPickerProps {
  onSelect: (gif: GIFResult) => void;
  onClose: () => void;
  className?: string;
}

export function GIFPicker({ onSelect, onClose, className }: GIFPickerProps) {
  const { t } = useT();
  const [searchQuery, setSearchQuery] = useState('');
  const [gifs, setGifs] = useState<GIFResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchGIFs = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (query.trim()) {
        params.set('q', query.trim());
      }

      const response = await fetch(`/api/gifs/search?${params.toString()}`);
      const data = (await response.json()) as { results?: GIFResult[]; error?: string };

      if (!response.ok) {
        setGifs([]);
        setError(data.error || t('chat.gifSearchUnavailable'));
        return;
      }

      setGifs(Array.isArray(data.results) ? data.results : []);
    } catch {
      setGifs([]);
      setError(t('chat.gifSearchUnavailable'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void searchGIFs(searchQuery);
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [searchQuery, searchGIFs]);

  return (
    <div className={cn('w-80 bg-background border border-border/50 rounded-t-xl shadow-xl flex flex-col max-h-96', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
        <Search className="size-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('chat.gifSearchPlaceholder')}
          className="h-7 text-sm border-0 focus-visible:ring-0 px-0 bg-transparent"
        />
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      {/* GIF Grid */}
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-2 gap-1 p-2">
          {gifs.map((gif) => (
            <button
              key={gif.id}
              onClick={() => onSelect(gif)}
              className="rounded-lg overflow-hidden bg-muted hover:opacity-80 transition-opacity aspect-square flex items-center justify-center"
            >
              {gif.previewUrl || gif.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={gif.previewUrl || gif.url} alt={gif.title} className="w-full h-full object-cover" />
              ) : (
                <span className="text-muted-foreground text-xs text-center px-2">{gif.title}</span>
              )}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="size-5 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="px-4 py-3">
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          </div>
        )}

        {!loading && !error && gifs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <p className="text-sm">{t('chat.gifSearchHint')}</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
