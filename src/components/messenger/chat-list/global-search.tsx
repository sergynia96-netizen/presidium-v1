'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  MessagesSquare,
  Hash,
  Megaphone,
  Image,
  Film,
  Download,
  Link2,
  File,
  Music,
  Mic,
  Globe,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/store/use-app-store';
import { useApiStore } from '@/store/use-api-store';
import { chatsApi } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { TranslationKey } from '@/lib/i18n';
import { globalSearch, type SearchResult } from '@/lib/search';

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const PLACEHOLDER_COLORS = [
  'bg-emerald-brand/20',
  'bg-amber-ai/20',
  'bg-blue-400/20',
  'bg-rose-400/20',
  'bg-violet-400/20',
  'bg-teal-400/20',
  'bg-orange-400/20',
  'bg-pink-400/20',
  'bg-cyan-400/20',
];

const MOCK_MUSIC_FILES = [
  { name: 'Ambient Flow', artist: 'Nature Sounds', duration: '3:45' },
  { name: 'Lo-Fi Beats', artist: 'ChillHop', duration: '4:12' },
  { name: 'Focus Mode', artist: 'Brainwave', duration: '5:30' },
];

const MOCK_VOICE_MESSAGES = [
  { from: 'Sarah Chen', duration: '0:23' },
  { from: 'Mike Ross', duration: '1:05' },
  { from: 'Dmitry K.', duration: '0:45' },
];

const MOCK_LINKS = [
  { title: 'PR #247 - WebSocket refactor', url: 'github.com/presidium/pr/247' },
  { title: 'Design System Docs', url: 'figma.com/presidium/design' },
  { title: 'Deployment Guide', url: 'docs.presidium.app/deploy' },
];

const MOCK_FILES = [
  { name: 'architecture.pdf', size: '2.4 MB', type: 'pdf' },
  { name: 'budget_2024.xlsx', size: '156 KB', type: 'xlsx' },
  { name: 'meeting_notes.md', size: '24 KB', type: 'md' },
  { name: 'logo_v3.svg', size: '48 KB', type: 'svg' },
];

export default function GlobalSearch() {
  const { t } = useT();
  const { goBack, setActiveChat, setView, chats } = useAppStore();
  const syncChats = useApiStore((s) => s.syncChats);

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('global');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const tabs = [
    { id: 'global', labelKey: 'search.global' as TranslationKey, icon: Globe },
    { id: 'chats', labelKey: 'search.tabs.chats' as TranslationKey, icon: MessagesSquare },
    { id: 'channels', labelKey: 'search.tabs.channels' as TranslationKey, icon: Hash },
    { id: 'publications', labelKey: 'search.tabs.publications' as TranslationKey, icon: Megaphone },
    { id: 'photos', labelKey: 'search.tabs.photos' as TranslationKey, icon: Image },
    { id: 'videos', labelKey: 'search.tabs.videos' as TranslationKey, icon: Film },
    { id: 'downloads', labelKey: 'search.tabs.downloads' as TranslationKey, icon: Download },
    { id: 'links', labelKey: 'search.tabs.links' as TranslationKey, icon: Link2 },
    { id: 'files', labelKey: 'search.tabs.files' as TranslationKey, icon: File },
    { id: 'music', labelKey: 'search.tabs.music' as TranslationKey, icon: Music },
    { id: 'voice', labelKey: 'search.tabs.voice' as TranslationKey, icon: Mic },
  ];

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);
      try {
        const results = await globalSearch(normalized, 60);
        if (!cancelled) {
          setSearchResults(results);
        }
      } catch {
        if (!cancelled) {
          setSearchError('Search failed');
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const filteredSearchResults = useMemo(() => {
    if (!query.trim()) return [] as SearchResult[];
    switch (activeTab) {
      case 'global':
        return searchResults;
      case 'chats':
        return searchResults.filter((result) =>
          result.type === 'chat' || result.type === 'group' || result.type === 'channel' || result.type === 'message',
        );
      case 'channels':
      case 'publications':
        return searchResults.filter((result) => result.type === 'group' || result.type === 'channel');
      default:
        return [];
    }
  }, [activeTab, query, searchResults]);

  const openSearchResult = useCallback(
    async (result: SearchResult) => {
      // Chat/group/channel — переходим напрямую
      if (result.type === 'chat' || result.type === 'group' || result.type === 'channel') {
        const targetChatId = result.chatId || result.id;
        if (targetChatId) {
          setActiveChat(targetChatId);
          setView('chat');
          if (result.messageId && typeof window !== 'undefined') {
            window.localStorage.setItem('presidium:jumpToMessageId', result.messageId);
          }
        }
        return;
      }

      // Message — переходим в чат к сообщению
      if (result.type === 'message' && result.chatId) {
        setActiveChat(result.chatId);
        setView('chat');
        if (result.messageId && typeof window !== 'undefined') {
          window.localStorage.setItem('presidium:jumpToMessageId', result.messageId);
        }
        return;
      }

      // Contact — проверяем есть ли чат, создаём если нет
      if (result.type === 'contact') {
        const targetUserId = result.id;
        if (!targetUserId) return;

        // Ищем существующий приватный чат локально по членству.
        const existingChat = chats.find(
          (chat) => chat.type === 'private' && Array.isArray(chat.members) && chat.members.includes(targetUserId),
        );
        if (existingChat) {
          setActiveChat(existingChat.id);
          setView('chat');
          return;
        }

        // Создаём новый приватный чат через текущий API-контракт.
        try {
          const createRes = await chatsApi.create({
            name: result.title || 'Direct chat',
            type: 'private',
            memberIds: [targetUserId],
            isEncrypted: true,
            encryptionType: 'e2e',
          });

          const createResPayload = createRes as unknown as {
            chat?: { id?: string };
            data?: { chat?: { id?: string } };
          };
          const newChat = createResPayload.chat || createResPayload.data?.chat;
          if (newChat?.id) {
            void syncChats();
            setActiveChat(newChat.id);
            setView('chat');
          }
        } catch {
          console.error('[global-search] Failed to create chat for contact:', targetUserId);
        }
        return;
      }
    },
    [chats, setActiveChat, setView, syncChats],
  );

  const renderSearchResults = useCallback(
    (results: SearchResult[]) => (
      <div className="flex flex-col">
        {results.map((result) => (
          <button
            key={`${result.type}:${result.id}:${result.messageId || ''}`}
            type="button"
            onClick={() => openSearchResult(result)}
            className="flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
          >
            <Avatar className="size-10 shrink-0">
              <AvatarFallback className="bg-surface-secondary text-xs font-semibold text-foreground">
                {result.title ? getInitials(result.title) : '?'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{result.title}</p>
              {result.highlightedText && (
                <p className="truncate text-xs text-foreground/80">{result.highlightedText}</p>
              )}
              {result.subtitle && (
                <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p>
              )}
            </div>
            <Badge variant="secondary" className="mt-0.5 text-[10px] uppercase">
              {result.type}
            </Badge>
          </button>
        ))}
      </div>
    ),
    [openSearchResult],
  );

  const hasResults = useMemo(() => {
    if (!query.trim()) return true;
    switch (activeTab) {
      case 'global':
      case 'chats':
      case 'channels':
      case 'publications':
        return filteredSearchResults.length > 0;
      case 'photos':
      case 'videos':
      case 'downloads':
        return true; // always show placeholders
      case 'music':
        return MOCK_MUSIC_FILES.some(
          (f) => f.name.toLowerCase().includes(query.toLowerCase()) || f.artist.toLowerCase().includes(query.toLowerCase())
        );
      case 'voice':
        return MOCK_VOICE_MESSAGES.some(
          (v) => v.from.toLowerCase().includes(query.toLowerCase())
        );
      case 'links':
        return MOCK_LINKS.some(
          (l) => l.title.toLowerCase().includes(query.toLowerCase()) || l.url.toLowerCase().includes(query.toLowerCase())
        );
      case 'files':
        return MOCK_FILES.some(
          (f) => f.name.toLowerCase().includes(query.toLowerCase())
        );
      default:
        return false;
    }
  }, [activeTab, filteredSearchResults.length, query]);

  const renderContent = () => {
    if (!query.trim()) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Search className="size-10 opacity-30" />
          <p className="text-sm">{t('search.typeToSearch')}</p>
        </div>
      );
    }

    if (isSearching) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Search className="size-10 animate-pulse opacity-30" />
          <p className="text-sm">Searching...</p>
        </div>
      );
    }

    if (searchError) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Search className="size-10 opacity-30" />
          <p className="text-sm">Search is temporarily unavailable</p>
        </div>
      );
    }

    if (!hasResults) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Search className="size-10 opacity-30" />
          <p className="text-sm">{t('search.noResults')}</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'global':
      case 'chats':
        return renderSearchResults(filteredSearchResults);

      case 'channels':
        return renderSearchResults(filteredSearchResults);

      case 'photos':
        return (
          <div className="grid grid-cols-3 gap-1 p-4">
            {PLACEHOLDER_COLORS.map((color, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
                className={cn('aspect-square rounded-md', color)}
              />
            ))}
          </div>
        );

      case 'videos':
        return (
          <div className="grid grid-cols-2 gap-2 p-4">
            {PLACEHOLDER_COLORS.slice(0, 6).map((color, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
                className={cn(
                  'relative aspect-video rounded-md',
                  color
                )}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <Film className="size-5 text-muted-foreground/40" />
                </div>
              </motion.div>
            ))}
          </div>
        );

      case 'downloads':
        return (
          <div className="grid grid-cols-3 gap-1 p-4">
            {PLACEHOLDER_COLORS.slice(0, 6).map((color, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
                className={cn(
                  'relative aspect-square rounded-md flex items-center justify-center',
                  color
                )}
              >
                <Download className="size-4 text-muted-foreground/40" />
              </motion.div>
            ))}
          </div>
        );

      case 'music':
        return (
          <div className="flex flex-col gap-1 p-4">
            {MOCK_MUSIC_FILES
              .filter(
                (f) =>
                  !query.trim() ||
                  f.name.toLowerCase().includes(query.toLowerCase()) ||
                  f.artist.toLowerCase().includes(query.toLowerCase())
              )
              .map((track, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-brand/10">
                    <Music className="size-4 text-emerald-brand" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{track.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {track.artist} &middot; {track.duration}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        );

      case 'voice':
        return (
          <div className="flex flex-col gap-1 p-4">
            {MOCK_VOICE_MESSAGES
              .filter(
                (v) =>
                  !query.trim() ||
                  v.from.toLowerCase().includes(query.toLowerCase())
              )
              .map((msg, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-brand/10">
                    <Mic className="size-4 text-emerald-brand" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{msg.from}</p>
                    <p className="text-xs text-muted-foreground">{msg.duration}</p>
                  </div>
                </div>
              ))}
          </div>
        );

      case 'links':
        return (
          <div className="flex flex-col gap-1 p-4">
            {MOCK_LINKS.filter(
              (l) =>
                !query.trim() ||
                l.title.toLowerCase().includes(query.toLowerCase()) ||
                l.url.toLowerCase().includes(query.toLowerCase())
            ).map((link, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-brand/10">
                  <Link2 className="size-4 text-emerald-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{link.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{link.url}</p>
                </div>
              </div>
            ))}
          </div>
        );

      case 'files':
        return (
          <div className="flex flex-col gap-1 p-4">
            {MOCK_FILES.filter(
              (f) =>
                !query.trim() ||
                f.name.toLowerCase().includes(query.toLowerCase())
            ).map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border bg-card p-3"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded bg-blue-500/10">
                  <File className="size-4 text-blue-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{file.size}</p>
                </div>
                <Badge variant="secondary" className="text-[10px] uppercase">
                  {file.type}
                </Badge>
              </div>
            ))}
          </div>
        );

      case 'publications':
        return renderSearchResults(filteredSearchResults);

      default:
        return (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Search className="size-10 opacity-30" />
            <p className="text-sm">{t('search.noResults')}</p>
          </div>
        );
    }
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 250 }}
      className="absolute inset-0 z-50 flex flex-col bg-background"
    >
      {/* Header with search */}
      <header className="flex shrink-0 items-center gap-2 border-b bg-background/95 px-3 py-2.5 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          onClick={goBack}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="global-search-input"
            data-global-search-input
            aria-label="Global search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('chatList.search')}
            className="h-9 pl-9"
            autoFocus
          />
        </div>
      </header>

      {/* Scrollable filter tabs */}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-2 no-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-emerald-brand text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
              )}
            >
              <Icon className="size-3" />
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Results area */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {renderContent()}
        </div>
      </ScrollArea>
    </motion.div>
  );
}
