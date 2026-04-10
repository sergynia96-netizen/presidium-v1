import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AppView,
  OnboardingStep,
  TabView,
  Chat,
  ChatFolder,
  Message,
  User,
  Contact,
  CallRecord,
  MarketplaceItem,
  CartItem,
  FeedPost,
  ModerationResult,
  AIConversation,
} from '@/types';

const anonymousUser: User = {
  id: 'anonymous',
  name: 'Anonymous',
  email: '',
  avatar: '',
  status: 'offline',
  pinEnabled: false,
};

export const MESSAGE_STATUS_ORDER: Record<Message['status'], number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

export function getHigherMessageStatus(
  current: Message['status'],
  incoming: Message['status'],
): Message['status'] {
  return MESSAGE_STATUS_ORDER[incoming] >= MESSAGE_STATUS_ORDER[current] ? incoming : current;
}

export function mergeMessagesPreservingStatus(messages: Message[]): Message[] {
  const byId = new Map<string, Message>();

  for (const msg of messages) {
    const existing = byId.get(msg.id);
    if (!existing) {
      byId.set(msg.id, msg);
      continue;
    }

    byId.set(msg.id, {
      ...existing,
      ...msg,
      status: getHigherMessageStatus(existing.status, msg.status),
      content: msg.content || existing.content,
      timestamp: msg.timestamp || existing.timestamp,
      createdAt: msg.createdAt || existing.createdAt,
      updatedAt: msg.updatedAt || existing.updatedAt,
      mediaUrl: msg.mediaUrl ?? existing.mediaUrl,
      mediaType: msg.mediaType ?? existing.mediaType,
      mediaName: msg.mediaName ?? existing.mediaName,
      mediaSize: msg.mediaSize ?? existing.mediaSize,
      mediaMimeType: msg.mediaMimeType ?? existing.mediaMimeType,
      replyTo: msg.replyTo ?? existing.replyTo,
      forwardedFrom: msg.forwardedFrom ?? existing.forwardedFrom,
      quoteSegment: msg.quoteSegment ?? existing.quoteSegment,
      silent: typeof msg.silent === 'boolean' ? msg.silent : existing.silent,
      isDeleted: Boolean(existing.isDeleted || msg.isDeleted),
      deletedAt: msg.deletedAt ?? existing.deletedAt,
      deletedBy: msg.deletedBy ?? existing.deletedBy,
      deletedForEveryone:
        typeof msg.deletedForEveryone === 'boolean' ? msg.deletedForEveryone : existing.deletedForEveryone,
      editHistory: msg.editHistory ?? existing.editHistory,
      readBy: msg.readBy ?? existing.readBy,
      isPinned: Boolean(existing.isPinned || msg.isPinned),
      isEdited: Boolean(existing.isEdited || msg.isEdited),
      anonymousAdmin:
        typeof msg.anonymousAdmin === 'boolean' ? msg.anonymousAdmin : existing.anonymousAdmin,
    });
  }

  return Array.from(byId.values());
}

type PrivacyLevel = 'everyone' | 'contacts' | 'nobody';

interface AppSettings {
  desktopNotif: boolean;
  taskbarAnim: boolean;
  sound: boolean;
  notifPrivate: boolean;
  notifChannels: boolean;
  notifGroups: boolean;
  notifNewUser: boolean;
  notifPinned: boolean;
  notifCalls: boolean;
  notifPreview: boolean;
  notifVibration: boolean;
  notifMutedAll: boolean;
  openClawEnabled: boolean;
  autoDelete: string;
  readReceipts: boolean;
  typingIndicators: boolean;
  onlineStatus: boolean;
  privacyLastSeen: PrivacyLevel;
  privacyProfilePhoto: PrivacyLevel;
  privacyAbout: PrivacyLevel;
  privacyGroupAdds: PrivacyLevel;
  privacyCallFrom: PrivacyLevel;
  privacyPhone: PrivacyLevel;
  contentProtection: boolean;
  lastSeenExceptions: string[];
  incognitoMode: boolean;
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  desktopNotif: true,
  taskbarAnim: false,
  sound: true,
  notifPrivate: true,
  notifChannels: true,
  notifGroups: true,
  notifNewUser: false,
  notifPinned: false,
  notifCalls: true,
  notifPreview: true,
  notifVibration: true,
  notifMutedAll: false,
  openClawEnabled: true,
  autoDelete: 'Off',
  readReceipts: true,
  typingIndicators: true,
  onlineStatus: true,
  privacyLastSeen: 'contacts',
  privacyProfilePhoto: 'contacts',
  privacyAbout: 'everyone',
  privacyGroupAdds: 'contacts',
  privacyCallFrom: 'everyone',
  privacyPhone: 'contacts',
  contentProtection: false,
  lastSeenExceptions: [],
  incognitoMode: false,
};

const LEGACY_MOCK_CHAT_NAMES = new Set([
  'Sarah Chen',
  'PRESIDIUM Dev Team',
  'Mike Ross',
  'Lena Park',
  'Presidium AI',
  'Security Research',
  'Dmitry K.',
  'Product Design',
]);

const LEGACY_MOCK_CONTACT_NAMES = new Set([
  'Sarah Chen',
  'Mike Ross',
  'Lena Park',
  'Dmitry K.',
  'Anna W.',
  'Jake L.',
]);

const LEGACY_MOCK_FEED_CHANNELS = new Set([
  'Presidium Updates',
  'Security Lab',
  'Dev Community',
  'Design Notes',
]);

const LEGACY_MOCK_AI_TITLES = new Set([
  'Daily Briefing',
  'Meeting Notes',
  'Code Review Helper',
  'Translation Memory',
]);

function isLegacyMockChat(chat: Chat): boolean {
  return /^chat-\d+$/i.test(chat.id) && LEGACY_MOCK_CHAT_NAMES.has(chat.name);
}

function isLegacyMockFeedPost(post: FeedPost): boolean {
  return /^feed-\d+$/i.test(post.id) && LEGACY_MOCK_FEED_CHANNELS.has(post.channelName);
}

function isLegacyMockAIConversation(conversation: AIConversation): boolean {
  return /^ai-\d+$/i.test(conversation.id) && LEGACY_MOCK_AI_TITLES.has(conversation.title);
}

function isLegacyMockContact(contact: Contact): boolean {
  return /^user-\d+$/i.test(contact.id) && LEGACY_MOCK_CONTACT_NAMES.has(contact.name);
}

function isLegacyMockCallRecord(record: CallRecord): boolean {
  return /^call-\d+$/i.test(record.id) && LEGACY_MOCK_CONTACT_NAMES.has(record.contactName);
}

function isLegacyMockUser(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.id === 'user-1' && user.email === 'alex@presidium.app';
}

function sanitizePersistedStoreData(state: Partial<AppState>): Partial<AppState> {
  const nextChats = (state.chats || [])
    .filter((chat) => !isLegacyMockChat(chat))
    .map((chat) => ({
      ...chat,
      notificationLevel: chat.notificationLevel || (chat.isMuted ? 'muted' : 'all'),
    }));
  const removedLegacyChatIds = new Set(
    (state.chats || []).filter((chat) => isLegacyMockChat(chat)).map((chat) => chat.id),
  );

  const nextMessages: Record<string, Message[]> = {};
  const sourceMessages = state.messages || {};
  Object.entries(sourceMessages).forEach(([chatId, chatMessages]) => {
    if (removedLegacyChatIds.has(chatId)) return;
    if (/^chat-\d+$/i.test(chatId) && !nextChats.some((chat) => chat.id === chatId)) return;
    nextMessages[chatId] = chatMessages;
  });

  const nextContacts = (state.contacts || []).filter((contact) => !isLegacyMockContact(contact));
  const nextCallRecords = (state.callRecords || []).filter((record) => !isLegacyMockCallRecord(record));
  const nextFeedPosts = (state.feedPosts || []).filter((post) => !isLegacyMockFeedPost(post));
  const nextAiConversations = (state.aiConversations || []).filter(
    (conversation) => !isLegacyMockAIConversation(conversation),
  );
  const validChatIds = new Set(nextChats.map((chat) => chat.id));
  const nextChatFolders = (state.chatFolders || [])
    .filter((folder) => typeof folder.name === 'string' && folder.name.trim().length > 0)
    .map((folder) => ({
      ...folder,
      chatIds: (folder.chatIds || []).filter((chatId) => validChatIds.has(chatId)),
    }));

  const hasLegacyMockUser = isLegacyMockUser(state.user);

  return {
    ...state,
    chats: nextChats,
    messages: nextMessages,
    contacts: nextContacts,
    callRecords: nextCallRecords,
    feedPosts: nextFeedPosts,
    aiConversations: nextAiConversations,
    chatFolders: nextChatFolders,
    isAuthenticated: hasLegacyMockUser ? false : state.isAuthenticated,
    user: hasLegacyMockUser ? null : state.user,
  };
}

type PersistedStoreSlice = {
  isAuthenticated: boolean;
  user: User | null;
  pendingRegistration: User | null;
  pendingPassword: null;
  locale: 'en' | 'ru';
  accentColor: string;
  currentView: AppView;
  chats: Chat[];
  messages: Record<string, Message[]>;
  contacts: Contact[];
  callRecords: CallRecord[];
  feedPosts: FeedPost[];
  favorites: string[];
  activeTab: TabView;
  activeFolder: string;
  chatFolders: ChatFolder[];
  cart: CartItem[];
  blockedChatIds: string[];
  settings: AppSettings;
  aiConversations: AIConversation[];
};

function toPersistedStoreSlice(state: Partial<AppState>): PersistedStoreSlice {
  const sanitized = sanitizePersistedStoreData(state);

  return {
    isAuthenticated: Boolean(sanitized.isAuthenticated),
    user: sanitized.user ?? null,
    pendingRegistration: sanitized.pendingRegistration ?? null,
    pendingPassword: null,
    locale: sanitized.locale === 'ru' ? 'ru' : 'en',
    accentColor: sanitized.accentColor || 'emerald',
    currentView: sanitized.currentView || 'onboarding',
    chats: sanitized.chats || [],
    messages: sanitized.messages || {},
    contacts: sanitized.contacts || [],
    callRecords: sanitized.callRecords || [],
    feedPosts: sanitized.feedPosts || [],
    favorites: sanitized.favorites || [],
    activeTab: sanitized.activeTab || 'chats',
    activeFolder: sanitized.activeFolder || 'all',
    chatFolders: sanitized.chatFolders || [],
    cart: sanitized.cart || [],
    blockedChatIds: sanitized.blockedChatIds || [],
    settings: {
      ...DEFAULT_APP_SETTINGS,
      ...(sanitized.settings || {}),
      openClawEnabled: true,
    },
    aiConversations: sanitized.aiConversations || [],
  };
}

interface AppState {
  // View management
  currentView: AppView;
  onboardingStep: OnboardingStep;
  previousView: AppView | null;
  activeTab: TabView;

  // Auth
  isAuthenticated: boolean;
  user: User | null;
  pendingRegistration: User | null;
  pendingPassword: string | null; // Temporarily stored for signIn, cleared after login

  // Chat data
  chats: Chat[];
  messages: Record<string, Message[]>;
  activeChatId: string | null;
  searchQuery: string;
  activeFolder: string;
  chatFolders: ChatFolder[];

  // New data
  contacts: Contact[];
  callRecords: CallRecord[];
  feedPosts: FeedPost[];
  cart: CartItem[];
  favorites: string[]; // message IDs

  // UI
  showAIActions: boolean;
  showChatMenu: boolean;
  selectedMessageId: string | null;
  locale: 'en' | 'ru';
  accentColor: string;

  // Context menu target
  contextMenuChatId: string | null;

  // Blocked chats
  blockedChatIds: string[];

  // OpenClaw Moderation
  moderationResults: Record<string, ModerationResult>;
  typingUsersByChat: Record<string, string[]>;

  // Realtime bridge (in-memory, not persisted)
  wsConnected: boolean;
  wsSendMessageToChat: ((chatId: string, payload: unknown) => boolean) | null;
  wsSendTyping: ((chatId: string, isTyping: boolean) => boolean) | null;
  wsSendReadReceipt: ((chatId: string, messageId: string) => boolean) | null;
  wsJoinChat: ((chatId: string) => boolean) | null;
  wsLeaveChat: ((chatId: string) => boolean) | null;

  // Settings
  settings: AppSettings;

  // AI Center conversations
  aiConversations: AIConversation[];

  // Actions - Navigation
  setView: (view: AppView) => void;
  goBack: () => void;
  setOnboardingStep: (step: OnboardingStep) => void;
  setActiveTab: (tab: TabView) => void;

  // Actions - Auth
  login: (user: User) => void;
  logout: () => void;
  completeOnboarding: () => Promise<void>;

  // Actions - Chat
  setActiveChat: (id: string | null) => void;
  sendMessage: (
    chatId: string,
    content: string,
    options?: {
      id?: string;
      replyTo?: Message['replyTo'];
      forwardedFrom?: Message['forwardedFrom'];
      status?: Message['status'];
      quoteSegment?: Message['quoteSegment'];
      silent?: boolean;
      senderAlias?: {
        id?: string;
        name: string;
        avatar?: string;
      };
      anonymousAdmin?: boolean;
    },
  ) => string;
  sendMediaMessage: (
    chatId: string,
    media: {
      mediaUrl: string;
      mediaType: 'image' | 'file' | 'audio';
      mediaName: string;
      mediaSize: number;
      mediaMimeType: string;
    },
    options?: {
      id?: string;
      replyTo?: Message['replyTo'];
      forwardedFrom?: Message['forwardedFrom'];
      previewContent?: string;
      messageType?: Message['type'];
      status?: Message['status'];
      quoteSegment?: Message['quoteSegment'];
      silent?: boolean;
      senderAlias?: {
        id?: string;
        name: string;
        avatar?: string;
      };
      anonymousAdmin?: boolean;
    },
  ) => string;
  receiveMessage: (chatId: string, message: Message) => void;
  setMessagesForChat: (chatId: string, messages: Message[]) => void;
  setMessageStatus: (chatId: string, messageId: string, status: Message['status']) => void;
  addMessageReader: (chatId: string, messageId: string, userId: string) => void;
  editMessageContent: (chatId: string, messageId: string, content: string) => void;
  removeMessage: (chatId: string, messageId: string) => void;
  tombstoneMessage: (
    chatId: string,
    messageId: string,
    options?: { deletedBy?: string; deletedForEveryone?: boolean },
  ) => void;
  toggleMessagePin: (chatId: string, messageId: string) => void;
  setSearchQuery: (query: string) => void;
  setActiveFolder: (folder: string) => void;
  createChatFolder: (name: string) => string;
  renameChatFolder: (folderId: string, name: string) => void;
  deleteChatFolder: (folderId: string) => void;
  toggleChatInFolder: (chatId: string, folderId: string) => void;
  setChatWallpaper: (chatId: string, wallpaper?: string) => void;
  setChatNotificationLevel: (chatId: string, level: 'all' | 'mentions' | 'muted') => void;
  togglePin: (chatId: string) => void;
  toggleMute: (chatId: string) => void;
  archiveChat: (chatId: string) => void;
  restoreChat: (chatId: string) => void;
  clearChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  markUnread: (chatId: string) => void;

  // Actions - UI
  toggleAIActions: () => void;
  setShowChatMenu: (show: boolean) => void;
  setSelectedMessageId: (id: string | null) => void;
  setLocale: (locale: 'en' | 'ru') => void;
  setAccentColor: (color: string) => void;
  setContextMenuChatId: (id: string | null) => void;

  // Actions - Block
  blockChat: (chatId: string) => void;
  unblockChat: (chatId: string) => void;

  // Actions - Favorites
  toggleFavorite: (messageId: string) => void;

  // Actions - Feed
  togglePostLike: (postId: string) => void;
  togglePostDislike: (postId: string) => void;
  addComment: (postId: string, comment: { id: string; authorName: string; content: string; timestamp: string; likes: number }) => void;
  addPost: (post: FeedPost) => void;
  repostPost: (postId: string) => void;

  // Actions - Cart
  addToCart: (item: MarketplaceItem) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;

  // Actions - Calls
  addCallRecord: (record: CallRecord) => void;

  // Actions - Contacts
  addContact: (contact: Contact) => void;

  // Actions - OpenClaw Moderation
  setModerationResult: (messageId: string, result: ModerationResult) => void;
  clearModerationResult: (messageId: string) => void;
  setChatTypingUser: (chatId: string, userId: string, isTyping: boolean) => void;

  // Actions - Realtime bridge
  setWebSocketBridge: (bridge: {
    connected: boolean;
    sendMessageToChat: (chatId: string, payload: unknown) => boolean;
    sendTyping: (chatId: string, isTyping: boolean) => boolean;
    sendReadReceipt: (chatId: string, messageId: string) => boolean;
    joinChat: (chatId: string) => boolean;
    leaveChat: (chatId: string) => boolean;
  }) => void;
  clearWebSocketBridge: () => void;

  // Actions - Settings
  updateSettings: (partial: Partial<AppState['settings']>) => void;

  // Actions - AI Center
  addAIConversation: (conversation: AIConversation) => void;
  updateAIConversation: (id: string, update: Partial<AIConversation>) => void;
  setAIConversations: (conversations: AIConversation[]) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentView: 'onboarding',
      onboardingStep: 'welcome',
      previousView: null,
      activeTab: 'chats',
      isAuthenticated: false,
      user: null,
      pendingRegistration: null,
      pendingPassword: null,
      chats: [],
      messages: {},
      activeChatId: null,
      searchQuery: '',
      activeFolder: 'all',
      chatFolders: [],
      contacts: [],
      callRecords: [],
      feedPosts: [],
      cart: [],
      favorites: [],
      showAIActions: false,
      showChatMenu: false,
      selectedMessageId: null,
      locale: 'en',
      accentColor: 'emerald',
      contextMenuChatId: null,
      blockedChatIds: [],
      moderationResults: {},
      typingUsersByChat: {},
      wsConnected: false,
      wsSendMessageToChat: null,
      wsSendTyping: null,
      wsSendReadReceipt: null,
      wsJoinChat: null,
      wsLeaveChat: null,

      // Settings defaults
      settings: DEFAULT_APP_SETTINGS,

      // AI Center starts empty — only real conversations appear.
      aiConversations: [],

      // Navigation
      setView: (view) => {
        const prev = get().currentView;
        set({ currentView: view, previousView: prev });
      },
      goBack: () => {
        const prev = get().previousView;
        if (prev) {
          set({ currentView: prev, previousView: null });
        } else {
          set({ currentView: 'chats', previousView: null });
        }
      },
      setOnboardingStep: (step) => set({ onboardingStep: step }),
      setActiveTab: (tab) => set({ activeTab: tab }),

      // Auth
      login: (user) => {
        set({
          isAuthenticated: true,
          user,
          currentView: 'chats',
          onboardingStep: 'welcome',
        });
      },
      logout: () => {
        if (typeof window !== 'undefined') {
          void (async () => {
            try {
              const { signOut } = await import('next-auth/react');
              await signOut({ redirect: false });
            } catch {
              // Ignore sign-out transport errors; local cleanup still proceeds.
            }

            try {
              const [{ clearOutbox }, { sessionManager }, { clearAllData }] = await Promise.all([
                import('@/lib/message-outbox'),
                import('@/lib/crypto/session-manager'),
                import('@/lib/crypto/store'),
              ]);
              clearOutbox();
              await sessionManager.deleteAllSessions();
              await clearAllData();
            } catch {
              // Ignore non-critical cleanup failures.
            }
          })();
        }

        set({
          isAuthenticated: false,
          user: null,
          pendingRegistration: null,
          pendingPassword: null,
          currentView: 'onboarding',
          onboardingStep: 'welcome',
          previousView: null,
          activeTab: 'chats',
          chats: [],
          messages: {},
          activeChatId: null,
          searchQuery: '',
          activeFolder: 'all',
          chatFolders: [],
          contacts: [],
          callRecords: [],
          feedPosts: [],
          cart: [],
          favorites: [],
          showAIActions: false,
          showChatMenu: false,
          selectedMessageId: null,
          contextMenuChatId: null,
          blockedChatIds: [],
          moderationResults: {},
          typingUsersByChat: {},
          wsConnected: false,
          wsSendMessageToChat: null,
          wsSendTyping: null,
          wsSendReadReceipt: null,
          wsJoinChat: null,
          wsLeaveChat: null,
          settings: {
            ...DEFAULT_APP_SETTINGS,
            openClawEnabled: true,
          },
          aiConversations: [],
        });
      },
      completeOnboarding: async () => {
        const registered = get().pendingRegistration;
        const password = get().pendingPassword;

        // If we have real credentials, sign in via NextAuth to create a server session
        if (registered && password && typeof window !== 'undefined') {
          const { signIn } = await import('next-auth/react');
          const result = await signIn('credentials', {
            email: registered.email,
            password,
            redirect: false,
          });

          if (result?.error) {
            throw new Error(result.error);
          }
        }

        // Auth session is valid (or not needed). Finalize onboarding state.
        set({
          isAuthenticated: true,
          user: registered || get().user,
          pendingRegistration: null,
          pendingPassword: null,
          currentView: 'chats',
          onboardingStep: 'welcome',
        });
      },

      // Chat
      setActiveChat: (id) => {
        const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;

        if (id) {
          const chat = get().chats.find((c) => c.id === id);
          if (chat) {
            set((state) => ({
              activeChatId: id,
              currentView: isDesktop ? state.currentView : 'chat',
              previousView: isDesktop ? state.previousView : 'chats',
              chats: state.chats.map((c) =>
                c.id === id ? { ...c, unreadCount: 0 } : c
              ),
            }));
          }
        } else {
          set({
            activeChatId: null,
            currentView: isDesktop ? get().currentView : 'chats',
          });
        }
      },
      sendMessage: (chatId, content, options) => {
        const msgId = options?.id || crypto.randomUUID();
        const nowIso = new Date().toISOString();
        const sender = get().user || anonymousUser;
        const senderAlias = options?.senderAlias;
        const newMsg: Message = {
          id: msgId,
          chatId,
          senderId: senderAlias?.id || sender.id,
          senderName: senderAlias?.name || sender.name,
          senderAvatar: senderAlias?.avatar || sender.avatar || '',
          content,
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          type: 'text',
          status: options?.status || 'sent',
          isMe: true,
          isPinned: false,
          isEdited: false,
          createdAt: nowIso,
          updatedAt: nowIso,
          silent: Boolean(options?.silent),
          replyTo: options?.replyTo,
          forwardedFrom: options?.forwardedFrom,
          quoteSegment: options?.quoteSegment,
          readBy: [],
          anonymousAdmin: Boolean(options?.anonymousAdmin),
        };
        set((state) => ({
          messages: {
            ...state.messages,
            [chatId]: [...(state.messages[chatId] || []), newMsg],
          },
          chats: state.chats.map((c) =>
            c.id === chatId
              ? { ...c, lastMessage: content, lastMessageTime: 'now' }
              : c
          ),
        }));
        return msgId;
      },
      sendMediaMessage: (chatId, media, options) => {
        const msgId = options?.id || crypto.randomUUID();
        const nowIso = new Date().toISOString();
        const previewContent =
          options?.previewContent ??
          (media.mediaType === 'image'
            ? media.mediaName || 'image'
            : media.mediaType === 'audio'
              ? media.mediaName || 'voice-message'
              : media.mediaName);
        const messageType = options?.messageType || 'media';
        const sender = get().user || anonymousUser;
        const senderAlias = options?.senderAlias;
        const newMsg: Message = {
          id: msgId,
          chatId,
          senderId: senderAlias?.id || sender.id,
          senderName: senderAlias?.name || sender.name,
          senderAvatar: senderAlias?.avatar || sender.avatar || '',
          content: previewContent,
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          type: messageType,
          status: options?.status || 'sent',
          isMe: true,
          isPinned: false,
          isEdited: false,
          createdAt: nowIso,
          updatedAt: nowIso,
          silent: Boolean(options?.silent),
          mediaUrl: media.mediaUrl,
          mediaType: media.mediaType,
          mediaName: media.mediaName,
          mediaSize: media.mediaSize,
          mediaMimeType: media.mediaMimeType,
          replyTo: options?.replyTo,
          forwardedFrom: options?.forwardedFrom,
          quoteSegment: options?.quoteSegment,
          readBy: [],
          anonymousAdmin: Boolean(options?.anonymousAdmin),
        };
        set((state) => ({
          messages: {
            ...state.messages,
            [chatId]: [...(state.messages[chatId] || []), newMsg],
          },
          chats: state.chats.map((c) =>
            c.id === chatId
              ? { ...c, lastMessage: previewContent, lastMessageTime: 'now' }
              : c
          ),
        }));
        return msgId;
      },
      receiveMessage: (chatId, message) =>
        set((state) => {
          const normalized: Message = {
            ...message,
            createdAt: message.createdAt || new Date().toISOString(),
            updatedAt: message.updatedAt || message.createdAt || new Date().toISOString(),
            readBy: message.readBy || [],
          };
          return {
            messages: {
              ...state.messages,
              [chatId]: [...(state.messages[chatId] || []), normalized],
            },
            chats: state.chats.map((c) =>
              c.id === chatId
                ? { ...c, lastMessage: normalized.content, lastMessageTime: 'now' }
                : c
            ),
          };
        }),
      setMessagesForChat: (chatId, nextMessages) =>
        set((state) => {
          const deduped = mergeMessagesPreservingStatus(nextMessages);
          const lastMessage = deduped[deduped.length - 1] || null;
          return {
            messages: {
              ...state.messages,
              [chatId]: deduped,
            },
            chats: state.chats.map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    lastMessage: lastMessage?.content || c.lastMessage,
                    lastMessageTime: lastMessage?.timestamp || c.lastMessageTime,
                  }
                : c
            ),
          };
        }),
      setMessageStatus: (chatId, messageId, status) =>
        set((state) => ({
          messages: {
            ...state.messages,
            [chatId]: (state.messages[chatId] || []).map((m) =>
              m.id === messageId
                ? { ...m, status: getHigherMessageStatus(m.status, status) }
                : m
            ),
          },
        })),
      addMessageReader: (chatId, messageId, userId) =>
        set((state) => ({
          messages: {
            ...state.messages,
            [chatId]: (state.messages[chatId] || []).map((m) => {
              if (m.id !== messageId) return m;
              const readBy = Array.from(new Set([...(m.readBy || []), userId]));
              return {
                ...m,
                readBy,
                status: getHigherMessageStatus(m.status, 'read'),
                updatedAt: new Date().toISOString(),
              };
            }),
          },
        })),
      editMessageContent: (chatId, messageId, content) =>
        set((state) => {
          const chatMessages = state.messages[chatId] || [];
          const updatedMessages = chatMessages.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  editHistory: [
                    ...(m.editHistory || []),
                    {
                      content: m.content,
                      editedAt: new Date().toISOString(),
                      editorId: state.user?.id,
                    },
                  ],
                  content,
                  isEdited: true,
                  updatedAt: new Date().toISOString(),
                }
              : m,
          );
          const lastMessage = updatedMessages[updatedMessages.length - 1] || null;

          return {
            messages: {
              ...state.messages,
              [chatId]: updatedMessages,
            },
            chats: state.chats.map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    lastMessage: lastMessage?.content || '',
                    lastMessageTime: lastMessage ? 'now' : c.lastMessageTime,
                  }
                : c,
            ),
          };
        }),
      toggleMessagePin: (chatId, messageId) =>
        set((state) => ({
          messages: {
            ...state.messages,
            [chatId]: (state.messages[chatId] || []).map((m) =>
              m.id === messageId ? { ...m, isPinned: !m.isPinned } : m
            ),
          },
        })),
      removeMessage: (chatId, messageId) =>
        set((state) => {
          const current = state.messages[chatId] || [];
          const nextMessages = current.filter((m) => m.id !== messageId);
          const nextLast = nextMessages[nextMessages.length - 1] || null;

          return {
            messages: {
              ...state.messages,
              [chatId]: nextMessages,
            },
            chats: state.chats.map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    lastMessage: nextLast?.content || '',
                    lastMessageTime: nextLast ? 'now' : '',
                  }
                : c,
            ),
          };
        }),
      tombstoneMessage: (chatId, messageId, options) =>
        set((state) => {
          const nextMessages = (state.messages[chatId] || []).map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  isDeleted: true,
                  deletedAt: new Date().toISOString(),
                  deletedBy: options?.deletedBy || state.user?.id || 'unknown',
                  deletedForEveryone: Boolean(options?.deletedForEveryone),
                  content: 'This message was deleted',
                  mediaUrl: undefined,
                  mediaType: undefined,
                  mediaName: undefined,
                  mediaSize: undefined,
                  mediaMimeType: undefined,
                  replyTo: undefined,
                  quoteSegment: undefined,
                  updatedAt: new Date().toISOString(),
                }
              : m
          );
          const nextLast = nextMessages[nextMessages.length - 1] || null;
          return {
            messages: {
              ...state.messages,
              [chatId]: nextMessages,
            },
            chats: state.chats.map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    lastMessage: nextLast?.content || '',
                    lastMessageTime: nextLast ? 'now' : '',
                  }
                : c,
            ),
          };
        }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setActiveFolder: (folder) => set({ activeFolder: folder }),
      createChatFolder: (name) => {
        const nextName = name.trim();
        if (!nextName) return '';
        const folderId = `folder-${crypto.randomUUID()}`;
        set((state) => ({
          chatFolders: [...state.chatFolders, { id: folderId, name: nextName, chatIds: [] }],
        }));
        return folderId;
      },
      renameChatFolder: (folderId, name) =>
        set((state) => ({
          chatFolders: state.chatFolders.map((folder) =>
            folder.id === folderId ? { ...folder, name: name.trim() || folder.name } : folder,
          ),
        })),
      deleteChatFolder: (folderId) =>
        set((state) => ({
          chatFolders: state.chatFolders.filter((folder) => folder.id !== folderId),
          activeFolder: state.activeFolder === folderId ? 'all' : state.activeFolder,
        })),
      toggleChatInFolder: (chatId, folderId) =>
        set((state) => ({
          chatFolders: state.chatFolders.map((folder) => {
            if (folder.id !== folderId) return folder;
            const exists = folder.chatIds.includes(chatId);
            return {
              ...folder,
              chatIds: exists
                ? folder.chatIds.filter((id) => id !== chatId)
                : [...folder.chatIds, chatId],
            };
          }),
        })),
      setChatWallpaper: (chatId, wallpaper) =>
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  wallpaper: wallpaper && wallpaper.trim().length > 0 ? wallpaper : undefined,
                }
              : chat,
          ),
        })),
      setChatNotificationLevel: (chatId, level) =>
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  notificationLevel: level,
                  isMuted: level === 'muted',
                }
              : chat,
          ),
        })),
      togglePin: (chatId) =>
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId ? { ...c, isPinned: !c.isPinned } : c
          ),
        })),
      toggleMute: (chatId) =>
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  isMuted: !c.isMuted,
                  notificationLevel: !c.isMuted ? 'muted' : 'all',
                }
              : c
          ),
        })),
      archiveChat: (chatId) =>
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId ? { ...c, isArchived: true } : c,
          ),
          activeChatId: state.activeChatId === chatId ? null : state.activeChatId,
        })),
      restoreChat: (chatId) =>
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId ? { ...c, isArchived: false } : c,
          ),
        })),
      clearChat: (chatId) =>
        set((state) => ({
          messages: { ...state.messages, [chatId]: [] },
        })),
      deleteChat: (chatId) =>
        set((state) => ({
          chats: state.chats.filter((c) => c.id !== chatId),
          activeChatId: state.activeChatId === chatId ? null : state.activeChatId,
          chatFolders: state.chatFolders.map((folder) => ({
            ...folder,
            chatIds: folder.chatIds.filter((id) => id !== chatId),
          })),
        })),
      markUnread: (chatId) =>
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId ? { ...c, unreadCount: 1 } : c
          ),
        })),

      // UI
      toggleAIActions: () => set((s) => ({ showAIActions: !s.showAIActions })),
      setShowChatMenu: (show) => set({ showChatMenu: show }),
      setSelectedMessageId: (id) => set({ selectedMessageId: id }),
      setLocale: (locale) => set({ locale }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setContextMenuChatId: (id) => set({ contextMenuChatId: id }),

      // Block
      blockChat: (chatId) =>
        set((state) => ({
          blockedChatIds: [...state.blockedChatIds, chatId],
          chats: state.chats.filter((c) => c.id !== chatId),
          activeChatId: state.activeChatId === chatId ? null : state.activeChatId,
        })),
      unblockChat: (chatId) =>
        set((state) => ({
          blockedChatIds: state.blockedChatIds.filter((id) => id !== chatId),
        })),

      // Favorites
      toggleFavorite: (messageId) =>
        set((state) => ({
          favorites: state.favorites.includes(messageId)
            ? state.favorites.filter((id) => id !== messageId)
            : [...state.favorites, messageId],
        })),

      // Feed
      togglePostLike: (postId) =>
        set((state) => ({
          feedPosts: state.feedPosts.map((p) =>
            p.id !== postId
              ? p
              : (() => {
                  const wasLiked = Boolean(p.isLiked);
                  const wasDisliked = Boolean(p.isDisliked);
                  const nextLiked = !wasLiked;
                  const likes = Math.max(0, p.likes + (wasLiked ? -1 : 1));
                  const dislikes = Math.max(
                    0,
                    (p.dislikes || 0) + (!wasLiked && wasDisliked ? -1 : 0),
                  );

                  return {
                    ...p,
                    isLiked: nextLiked,
                    isDisliked: nextLiked ? false : wasDisliked,
                    likes,
                    dislikes,
                  };
                })()
          ),
        })),
      togglePostDislike: (postId) =>
        set((state) => ({
          feedPosts: state.feedPosts.map((p) =>
            p.id !== postId
              ? p
              : (() => {
                  const wasLiked = Boolean(p.isLiked);
                  const wasDisliked = Boolean(p.isDisliked);
                  const nextDisliked = !wasDisliked;
                  const dislikes = Math.max(0, (p.dislikes || 0) + (wasDisliked ? -1 : 1));
                  const likes = Math.max(0, p.likes + (!wasDisliked && wasLiked ? -1 : 0));

                  return {
                    ...p,
                    isDisliked: nextDisliked,
                    isLiked: nextDisliked ? false : wasLiked,
                    dislikes,
                    likes,
                  };
                })()
          ),
        })),
      addComment: (postId, comment) =>
        set((state) => ({
          feedPosts: state.feedPosts.map((p) =>
            p.id === postId
              ? { ...p, comments: p.comments + 1, commentList: [...(p.commentList || []), comment] }
              : p
          ),
        })),
      addPost: (post) =>
        set((state) => ({
          feedPosts: [post, ...state.feedPosts],
        })),
      repostPost: (postId) =>
        set((state) => ({
          feedPosts: state.feedPosts.map((p) =>
            p.id === postId
              ? { ...p, repostCount: (p.repostCount || 0) + 1, isReposted: true }
              : p
          ),
        })),

      // Cart
      addToCart: (item) =>
        set((state) => {
          const existing = state.cart.find((c) => c.item.id === item.id);
          if (existing) {
            return {
              cart: state.cart.map((c) =>
                c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
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

      // Calls
      addCallRecord: (record) =>
        set((state) => ({
          callRecords: [record, ...state.callRecords],
        })),

      // Contacts
      addContact: (contact) =>
        set((state) => ({
          contacts: [...state.contacts, contact],
        })),

      // OpenClaw Moderation
      setModerationResult: (messageId, result) =>
        set((state) => ({
          moderationResults: { ...state.moderationResults, [messageId]: result },
        })),
      clearModerationResult: (messageId) =>
        set((state) => {
          const { [messageId]: _, ...rest } = state.moderationResults;
          return { moderationResults: rest };
        }),
      setChatTypingUser: (chatId, userId, isTyping) =>
        set((state) => {
          const current = state.typingUsersByChat[chatId] || [];
          const exists = current.includes(userId);
          const next = isTyping
            ? exists
              ? current
              : [...current, userId]
            : current.filter((id) => id !== userId);

          return {
            typingUsersByChat: {
              ...state.typingUsersByChat,
              [chatId]: next,
            },
          };
        }),

      // Realtime bridge
      setWebSocketBridge: (bridge) =>
        set({
          wsConnected: bridge.connected,
          wsSendMessageToChat: bridge.sendMessageToChat,
          wsSendTyping: bridge.sendTyping,
          wsSendReadReceipt: bridge.sendReadReceipt,
          wsJoinChat: bridge.joinChat,
          wsLeaveChat: bridge.leaveChat,
        }),
      clearWebSocketBridge: () =>
        set({
          wsConnected: false,
          wsSendMessageToChat: null,
          wsSendTyping: null,
          wsSendReadReceipt: null,
          wsJoinChat: null,
          wsLeaveChat: null,
        }),

      // Settings
      updateSettings: (partial) =>
        set((state) => ({
          settings: {
            ...state.settings,
            ...partial,
            // OpenClaw moderation is mandatory.
            openClawEnabled: true,
          },
        })),

      // AI Center
      addAIConversation: (conversation) =>
        set((state) => ({
          aiConversations: [conversation, ...state.aiConversations],
        })),
      updateAIConversation: (id, update) =>
        set((state) => ({
          aiConversations: state.aiConversations.map((c) =>
            c.id === id ? { ...c, ...update } : c
          ),
        })),
      setAIConversations: (conversations) =>
        set({ aiConversations: conversations }),
    }),
    {
      name: 'presidium-app-store-v2',
      version: 4,
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        pendingRegistration: state.pendingRegistration,
        pendingPassword: null, // Never persist password to localStorage
        locale: state.locale,
        accentColor: state.accentColor,
        currentView: state.currentView,
        chats: state.chats,
        messages: state.messages,
        contacts: state.contacts,
        callRecords: state.callRecords,
        feedPosts: state.feedPosts,
        favorites: state.favorites,
        activeTab: state.activeTab,
        activeFolder: state.activeFolder,
        chatFolders: state.chatFolders,
        cart: state.cart,
        blockedChatIds: state.blockedChatIds,
        settings: state.settings,
        aiConversations: state.aiConversations,
      }),
      migrate: (persistedState) => {
        const parsedState = (persistedState || {}) as Partial<AppState>;
        return toPersistedStoreSlice(parsedState);
      },
      onRehydrateStorage: () => {
        return (state) => {
          if (!state) return;
          const sanitized = toPersistedStoreSlice(state);

          // Keep real persisted data only; never inject demo/mock data.
          if (sanitized.isAuthenticated && sanitized.user) {
            useAppStore.setState({
              isAuthenticated: true,
              user: sanitized.user,
              chats: sanitized.chats ?? [],
              messages: sanitized.messages ?? {},
              contacts: sanitized.contacts ?? [],
              callRecords: sanitized.callRecords ?? [],
              feedPosts: sanitized.feedPosts ?? [],
              favorites: sanitized.favorites ?? [],
              chatFolders: sanitized.chatFolders ?? [],
              cart: sanitized.cart ?? [],
              aiConversations: sanitized.aiConversations ?? [],
            });
            // Restore settings if missing from storage
            useAppStore.setState({
              settings: {
                ...DEFAULT_APP_SETTINGS,
                ...(sanitized.settings || {}),
                // OpenClaw moderation is mandatory.
                openClawEnabled: true,
              },
            });
          }
          // Corrupted state: authenticated but no user object → reset
          if (sanitized.isAuthenticated && !sanitized.user) {
            useAppStore.setState({
              ...sanitized,
              currentView: 'onboarding',
              onboardingStep: 'welcome',
            });
          }
        };
      },
    },
  ),
);
     
