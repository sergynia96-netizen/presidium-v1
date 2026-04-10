'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  MessageSquarePlus,
  X,
  MessagesSquare,
  User,
  Briefcase,
  Sparkles,
  BellOff,
  UserPlus,
  ArchiveRestore,
  FolderPlus,
  Check,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';
import { ChatListItem } from './chat-list-item';
import ChatContextMenu from '@/components/messenger/chat-view/chat-context-menu';
import type { Chat, ChatFolder } from '@/types';
import { StoriesFeed, StoryViewer, StoryCreator } from '@/components/messenger/stories/stories-feed';
import type { StoryGroup, StoryItem } from '@/lib/stories';
import { getStoriesFeed, replyToStory } from '@/lib/stories';

const folderIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  MessagesSquare,
  User,
  Briefcase,
  Sparkles,
  BellOff,
};

function filterChatsByFolder(chats: Chat[], folderId: string, chatFolders: ChatFolder[]): Chat[] {
  switch (folderId) {
    case 'all':
      return chats;
    case 'personal':
      return chats.filter((c) => c.type === 'private');
    case 'work':
      return chats.filter((c) => c.type === 'group');
    case 'ai':
      return chats.filter((c) => c.type === 'ai');
    case 'muted':
      return chats.filter((c) => c.isMuted);
    default:
      break;
  }

  const customFolder = chatFolders.find((folder) => folder.id === folderId);
  if (!customFolder) return chats;
  return chats.filter((chat) => customFolder.chatIds.includes(chat.id));
}

function searchChats(chats: Chat[], query: string): Chat[] {
  if (!query.trim()) return chats;
  const lower = query.toLowerCase();
  return chats.filter(
    (c) =>
      c.name.toLowerCase().includes(lower) ||
      c.lastMessage.toLowerCase().includes(lower)
  );
}

const folderNameMap: Record<string, string> = {
  all: 'folders.all',
  personal: 'folders.personal',
  work: 'folders.work',
  ai: 'folders.ai',
  muted: 'folders.muted',
};

const folderDefinitions = [
  { id: 'all', icon: 'MessagesSquare' as const },
  { id: 'personal', icon: 'User' as const },
  { id: 'work', icon: 'Briefcase' as const },
  { id: 'ai', icon: 'Sparkles' as const },
  { id: 'muted', icon: 'BellOff' as const },
];

function getFolderCounts(chats: Chat[], chatFolders: ChatFolder[]): Record<string, number> {
  const base: Record<string, number> = {
    all: chats.length,
    personal: chats.filter((c) => c.type === 'private').length,
    work: chats.filter((c) => c.type === 'group').length,
    ai: chats.filter((c) => c.type === 'ai').length,
    muted: chats.filter((c) => c.isMuted).length,
  };

  for (const folder of chatFolders) {
    base[folder.id] = chats.filter((chat) => folder.chatIds.includes(chat.id)).length;
  }

  return base;
}

export function ChatList() {
  const { t } = useT();
  const [searchOpen, setSearchOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [contextMenuChatId, setContextMenuChatId] = useState<string | null>(null);
  const chats = useAppStore((s) => s.chats);
  const blockedChatIds = useAppStore((s) => s.blockedChatIds);
  const activeFolder = useAppStore((s) => s.activeFolder);
  const chatFolders = useAppStore((s) => s.chatFolders);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const setActiveFolder = useAppStore((s) => s.setActiveFolder);
  const createChatFolder = useAppStore((s) => s.createChatFolder);
  const setView = useAppStore((s) => s.setView);
  const currentUserId = useAppStore((s) => s.user?.id);

  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [activeStoryGroup, setActiveStoryGroup] = useState<StoryGroup | null>(null);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [isCreatingStory, setIsCreatingStory] = useState(false);

  const visibleChats = chats.filter((c) => !blockedChatIds.includes(c.id) && !c.isArchived);
  const archivedCount = chats.filter((c) => !blockedChatIds.includes(c.id) && c.isArchived).length;

  const folderCounts = useMemo(() => getFolderCounts(visibleChats, chatFolders), [chatFolders, visibleChats]);

  const filteredChats = searchChats(
    filterChatsByFolder(visibleChats, activeFolder, chatFolders),
    searchQuery
  );

  const pinnedChats = filteredChats.filter((c) => c.isPinned);
  const regularChats = filteredChats.filter((c) => !c.isPinned);

  const loadStories = useCallback(async () => {
    try {
      const feed = await getStoriesFeed();
      setStories(feed);
    } catch {
      // Ignore transient stories fetch errors in chat list UI.
    }
  }, []);

  useEffect(() => {
    const immediate = window.setTimeout(() => {
      void loadStories();
    }, 0);
    const timer = setInterval(() => {
      void loadStories();
    }, 60_000);
    return () => {
      clearTimeout(immediate);
      clearInterval(timer);
    };
  }, [loadStories]);

  const handleCreateFolder = () => {
    const value = newFolderName.trim();
    if (!value) return;
    const createdId = createChatFolder(value);
    if (createdId) {
      setActiveFolder(createdId);
    }
    setNewFolderName('');
    setCreateFolderOpen(false);
  };

  return (
    <div id="chat-list" role="navigation" aria-label="Chat list" className="flex h-full flex-col bg-background">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-2xl font-bold tracking-tight">{t('chatList.title')}</h1>
        <div className="flex items-center gap-1">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setSearchOpen(!searchOpen)}
            className="p-2 rounded-full hover:bg-accent transition-colors"
            aria-label="Search"
          >
            <Search className="size-5 text-muted-foreground" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setView('group-creation')}
            className="p-2 rounded-full hover:bg-accent transition-colors"
            aria-label="New group"
          >
            <MessageSquarePlus className="size-5 text-muted-foreground" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setView('new-contact')}
            className="p-2 rounded-full hover:bg-accent transition-colors"
            aria-label="New contact"
          >
            <UserPlus className="size-5 text-muted-foreground" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setView('archive')}
            className="relative p-2 rounded-full hover:bg-accent transition-colors"
            aria-label="Archive"
          >
            <ArchiveRestore className="size-5 text-muted-foreground" />
            {archivedCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 min-w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] px-1 flex items-center justify-center">
                {archivedCount}
              </span>
            )}
          </motion.button>
        </div>
      </div>

      {/* Search Bar */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="chat-search-input"
                  data-chat-search-input
                  placeholder={t('chatList.search')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 h-10 rounded-xl bg-muted/50 border-0 focus-visible:ring-1"
                  autoFocus
                />
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSearchOpen(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  aria-label="Close search"
                >
                  <X className="size-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Folder Tabs */}
      <div className="px-2 pb-1">
        <ScrollArea className="w-full">
          <div className="flex gap-1 py-1 px-2">
            {folderDefinitions.map((folder) => {
              const Icon = folderIcons[folder.icon] || MessagesSquare;
              const isActive = activeFolder === folder.id;
              return (
                <motion.button
                  key={folder.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveFolder(folder.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                  layout
                >
                  <Icon className="size-3.5" />
                  <span>{t(folderNameMap[folder.id] as unknown as never)}</span>
                  <span
                    className={`ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                      isActive
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {folderCounts[folder.id] ?? 0}
                  </span>
                </motion.button>
              );
            })}
            {chatFolders.map((folder) => {
              const isActive = activeFolder === folder.id;
              return (
                <motion.button
                  key={folder.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveFolder(folder.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                  layout
                >
                  <MessagesSquare className="size-3.5" />
                  <span>{folder.name}</span>
                  <span
                    className={`ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                      isActive
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {folderCounts[folder.id] ?? 0}
                  </span>
                </motion.button>
              );
            })}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setCreateFolderOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 bg-muted/50 text-muted-foreground hover:bg-muted"
              layout
            >
              <FolderPlus className="size-3.5" />
              <span>{t('chatList.addFolder')}</span>
            </motion.button>
          </div>
        </ScrollArea>
        <AnimatePresence>
          {createFolderOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden px-2"
            >
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background p-2">
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder={t('chatList.folderNamePlaceholder')}
                  className="h-8 border-0 bg-muted/40 focus-visible:ring-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                  }}
                />
                <button
                  type="button"
                  onClick={handleCreateFolder}
                  className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
                  aria-label={t('chatList.addFolder')}
                >
                  <Check className="size-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Separator */}
      <div className="h-px bg-border mx-4 mb-1" />

      <StoriesFeed
        stories={stories}
        onAddStory={() => {
          if (!currentUserId) return;
          setIsCreatingStory(true);
        }}
        onStoryTap={(group, index) => {
          setActiveStoryGroup(group);
          setActiveStoryIndex(index);
        }}
      />

      {/* Chat List */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          <AnimatePresence mode="popLayout">
            {pinnedChats.length > 0 && (
              <motion.div key="pinned-section" layout>
                <div className="flex items-center gap-2 px-5 py-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('chatList.pinned')}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                {pinnedChats.map((chat) => (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    onLongPress={() => setContextMenuChatId(chat.id)}
                  />
                ))}
              </motion.div>
            )}

            {regularChats.length > 0 && (
              <motion.div key="regular-section" layout>
                {pinnedChats.length > 0 && (
                  <div className="flex items-center gap-2 px-5 py-1.5 mt-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('chatList.all')}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                {regularChats.map((chat) => (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    onLongPress={() => setContextMenuChatId(chat.id)}
                  />
                ))}
              </motion.div>
            )}

            {filteredChats.length === 0 && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-16 text-center px-8"
              >
                <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Search className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('chatList.empty')}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {t('chatList.emptyHint')}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Context Menu */}
      {contextMenuChatId && (
        <ChatContextMenu
          chatId={contextMenuChatId}
          isOpen={!!contextMenuChatId}
          onClose={() => setContextMenuChatId(null)}
        />
      )}

      {/* Floating Action Button — mobile only */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setView('group-creation')}
        className="lg:hidden absolute bottom-20 right-4 md:right-6 size-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
        aria-label="New group"
      >
        <MessageSquarePlus className="size-6" />
      </motion.button>

      <AnimatePresence>
        {activeStoryGroup && (
          <StoryViewer
            group={activeStoryGroup}
            initialIndex={activeStoryIndex}
            onClose={() => {
              setActiveStoryGroup(null);
              setActiveStoryIndex(0);
              void loadStories();
            }}
            onReply={(storyId, content) => {
              void replyToStory(storyId, content);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCreatingStory && currentUserId && (
          <StoryCreator
            sourceType="user"
            sourceId={currentUserId}
            onClose={() => setIsCreatingStory(false)}
            onCreated={(_story: StoryItem) => {
              setIsCreatingStory(false);
              void loadStories();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
