'use client';

/*
 * CHANGELOG (Codex)
 * 2026-04-17:
 * - Wired ChatView E2E lifecycle to E2EProvider context instead of local duplicate init path.
 * - Added safer E2E recipient resolution for private chats only.
 * - Replaced header nested interactive structure (button-in-button risk) with accessible div role="button".
 * - Added guarded E2E session ensure calls to reduce retry/noise during relay auth failures.
 */

import { useEffect, useRef, useMemo, useCallback, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Phone,
  Video,
  MoreVertical,
  Search,
  Lock,
  Shield,
  Pin,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  X,
  Zap,
  AlertTriangle,
  Palette,
  Ghost,
  Copy,
  Image as ImageIcon,
  Trash2,
  CheckSquare,
  Square,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAppStore } from '@/store/use-app-store';
import { Message, ModerationResult } from '@/types';
import { MessageBubble } from './message-bubble';
import { MessageInput } from './message-input';
import type { GIFResult, Sticker } from './stickers-gif-picker';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { useMarkAsRead } from '@/hooks/use-mark-read';
import {
  OUTBOX_UPDATED_EVENT,
  enqueueOutboxTask,
  getOutboxMessageIndicators,
  getOutboxSize,
} from '@/lib/message-outbox';
import type { OutboxUpdatedDetail } from '@/lib/message-outbox';
import type { OutboxMessageIndicator } from '@/lib/message-outbox';
import {
  RELAY_QUEUE_DELIVERED_EVENT,
  parseRelayQueueDeliveredPayload,
  shouldShowRelayQueueDeliveredBanner,
} from '@/lib/realtime-events';
import type { RelayQueueDeliveredDetail } from '@/lib/realtime-events';
import { e2eChat } from '@/lib/crypto/chat-integration';
import { EncryptionStatusBadge, EncryptionNotice, SafetyNumberVerification, E2EInitializationBanner, E2EErrorBanner } from '@/components/messenger/e2e';
import { useE2EContext } from '@/components/providers/e2e-provider';
import { encryptMediaFile } from '@/lib/media';
import { runLocalOpenClaw } from '@/lib/openclaw';
import { bytesToBase64 } from '@/lib/crypto/utils';
import { getChatMedia, type MediaItem } from '@/lib/search';
import CallScreen from './call-screen';
import ChatContextMenu from './chat-context-menu';
import { toast } from 'sonner';

interface OpenClawModerationResponse {
  success?: boolean;
  moderated?: boolean;
  blocked?: boolean;
  flags?: Array<{ category: string; severity: 'low' | 'medium' | 'high'; description: string }>;
  suggestion?: string | null;
  isSafe?: boolean;
  riskLevel?: ModerationResult['riskLevel'];
  categories?: string[];
  warning?: string | null;
  suggestedAction?: string | null;
}

interface MessageGroupInfo {
  showAvatar: boolean;
  isLastInGroup: boolean;
}

const MAX_UPLOAD_FILE_SIZE = 50 * 1024 * 1024;
const DELETE_FOR_EVERYONE_LIMIT_MS = 15 * 60 * 1000;
const WALLPAPER_PRESETS: Array<{ id: string; label: string; value?: string }> = [
  { id: 'none', label: 'None', value: undefined },
  {
    id: 'emerald-grid',
    label: 'Emerald Grid',
    value:
      'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03)), radial-gradient(circle at 1px 1px, rgba(16,185,129,0.2) 1px, transparent 0)',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    value: 'linear-gradient(135deg, rgba(15,23,42,0.35), rgba(30,41,59,0.12))',
  },
  {
    id: 'paper',
    label: 'Paper',
    value: 'linear-gradient(0deg, rgba(255,255,255,0.03), rgba(0,0,0,0.03))',
  },
];
const ALLOWED_UPLOAD_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/json',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/mpeg',
  'audio/ogg',
  'audio/webm',
  'audio/wav',
]);

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function computeMessageGroups(messages: Message[]): Record<string, MessageGroupInfo> {
  const info: Record<string, MessageGroupInfo> = {};

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.type === 'system') {
      info[msg.id] = { showAvatar: false, isLastInGroup: true };
      continue;
    }

    const prev = i > 0 ? messages[i - 1] : null;
    const next = i < messages.length - 1 ? messages[i + 1] : null;

    const isConsecutiveWithPrev = prev && prev.senderId === msg.senderId && prev.type !== 'system';
    const isConsecutiveWithNext = next && next.senderId === msg.senderId && next.type !== 'system';

    info[msg.id] = {
      showAvatar: !isConsecutiveWithPrev,
      isLastInGroup: !isConsecutiveWithNext,
    };
  }

  return info;
}

function riskFromFlags(flags: Array<{ severity: 'low' | 'medium' | 'high' }>): ModerationResult['riskLevel'] {
  if (!flags.length) return 'none';
  if (flags.some((f) => f.severity === 'high')) return 'critical';
  if (flags.some((f) => f.severity === 'medium')) return 'medium';
  return 'low';
}

function toDateStamp(value?: string) {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date().toDateString();
  return parsed.toDateString();
}

function toHumanDay(value?: string, locale: 'en' | 'ru' = 'en') {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

function getMessageTimestampMs(message: Message): number | null {
  const source = message.createdAt || message.updatedAt;
  if (!source) return null;
  const parsed = new Date(source).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function ChatView() {
  const { t, tf } = useT();
  const {
    isInitialized: e2eProviderInitialized,
    error: e2eProviderError,
    onIncomingEncryptedMessage,
    reconnect: reconnectE2E,
  } = useE2EContext();

  const AI_SUGGESTION_CHIPS = [t('ai.summarize'), t('ai.translate'), t('ai.replyForMe'), t('ai.createTask')];

  const {
    activeChatId,
    chats,
    messages,
    contacts,
    sendMessage,
    sendMediaMessage,
    receiveMessage,
    setMessagesForChat,
    setMessageStatus,
    editMessageContent,
    removeMessage,
    tombstoneMessage,
    toggleMessagePin,
    setChatWallpaper,
    goBack,
    showAIActions,
    toggleAIActions,
    setView,
    wsConnected,
    wsSendMessageToChat,
    wsSendTyping,
    wsSendReadReceipt,
    wsJoinChat,
    wsLeaveChat,
    user,
    typingUsersByChat,
    settings,
    locale,
    updateSettings,
  } = useAppStore();

  const OPENCLAW_SUGGESTION_CHIPS = useMemo(
    () => [
      { label: t('openclaw.scanChat'), mode: 'scan' },
      { label: t('openclaw.safetyCheck'), mode: 'safety' },
      { label: t('openclaw.getInsights'), mode: 'insight' },
      { label: t('openclaw.myInterests'), mode: 'interest' },
    ],
    [t],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const activeChatIdRef = useRef<string | null>(activeChatId);
  const receiveMessageRef = useRef(receiveMessage);
  const tRef = useRef(t);
  const [showCallScreen, setShowCallScreen] = useState<'audio' | 'video' | null>(null);
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [openClawTyping, setOpenClawTyping] = useState(false);
  const [showOpenClawActions, setShowOpenClawActions] = useState(false);
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSenderId, setSearchSenderId] = useState('');
  const [searchMessageType, setSearchMessageType] = useState<
    '' | 'text' | 'media' | 'voice' | 'video-circle' | 'file' | 'link'
  >('');
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const [activeSearchResultIndex, setActiveSearchResultIndex] = useState(0);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [mediaGalleryType, setMediaGalleryType] = useState<'all' | 'image' | 'video' | 'file' | 'audio'>('all');
  const [mediaGalleryItems, setMediaGalleryItems] = useState<MediaItem[]>([]);
  const [mediaGalleryLoading, setMediaGalleryLoading] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [deleteTargetMessage, setDeleteTargetMessage] = useState<Message | null>(null);
  const [viewHistoryTarget, setViewHistoryTarget] = useState<Message | null>(null);
  const [forwardWithoutSender, setForwardWithoutSender] = useState(false);
  const [silentMode, setSilentMode] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const [e2eInitialized, setE2eInitialized] = useState(false);
  const [e2eError, setE2eError] = useState<string | null>(null);
  const [showSafetyVerification, setShowSafetyVerification] = useState(false);
  const [e2eVerified, setE2eVerified] = useState(false);
  const [wasConnected, setWasConnected] = useState(false);
  const [outboxSize, setOutboxSize] = useState(0);
  const [outboxMessageIndicators, setOutboxMessageIndicators] = useState<
    Record<string, OutboxMessageIndicator>
  >({});
  const [queueReplayInfo, setQueueReplayInfo] = useState<RelayQueueDeliveredDetail | null>(null);
  const [moderationDialog, setModerationDialog] = useState<{
    open: boolean;
    originalContent: string;
    result: ModerationResult | null;
    flags: Array<{ category: string; severity: 'low' | 'medium' | 'high'; description: string }>;
    suggestion: string | null;
  }>({
    open: false,
    originalContent: '',
    result: null,
    flags: [],
    suggestion: null,
  });

  const chat = useMemo(() => chats.find((c) => c.id === activeChatId), [chats, activeChatId]);
  const forwardTargetChats = useMemo(() => chats.filter((c) => c.id !== activeChatId), [activeChatId, chats]);
  const chatMessages = useMemo(() => (activeChatId ? messages[activeChatId] || [] : []), [messages, activeChatId]);
  const e2eRecipientId = useMemo(() => {
    if (!chat || chat.type !== 'private') return null;
    const members = Array.isArray(chat.members) ? chat.members : [];
    const peerId = members.find((memberId) => memberId && memberId !== user?.id);
    return peerId || null;
  }, [chat, user?.id]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    receiveMessageRef.current = receiveMessage;
  }, [receiveMessage]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // Auto mark messages as read when chat is opened
  useMarkAsRead(activeChatId);

  const pinnedMessages = useMemo(() => chatMessages.filter((m) => m.isPinned), [chatMessages]);
  const currentPinnedMessage = useMemo(
    () => (pinnedMessages.length > 0 ? pinnedMessages[Math.min(pinnedIndex, pinnedMessages.length - 1)] : null),
    [pinnedIndex, pinnedMessages],
  );
  const groupInfo = useMemo(() => computeMessageGroups(chatMessages), [chatMessages]);
  const peerTypingCount = useMemo(() => {
    if (!activeChatId) return 0;
    const typing = typingUsersByChat[activeChatId] || [];
    return typing.filter((id) => id !== user?.id).length;
  }, [activeChatId, typingUsersByChat, user?.id]);
  const typingUserNames = useMemo(() => {
    if (!activeChatId) return [] as string[];
    const typing = (typingUsersByChat[activeChatId] || []).filter((id) => id !== user?.id);
    const nameById = new Map<string, string>();

    for (const contact of contacts) {
      nameById.set(contact.id, contact.name);
    }
    for (const msg of chatMessages) {
      if (msg.senderId && msg.senderName) {
        nameById.set(msg.senderId, msg.senderName);
      }
    }

    return typing.map((id) => nameById.get(id) || id).filter((name) => name.trim().length > 0);
  }, [activeChatId, chatMessages, contacts, typingUsersByChat, user?.id]);
  const senderContext = useMemo(() => {
    const normalizedName =
      (user?.name && user.name.trim()) || user?.email?.split('@')[0] || 'Unknown';
    return {
      id: user?.id || '',
      name: normalizedName,
      avatar: user?.avatar || '',
    };
  }, [user?.avatar, user?.email, user?.id, user?.name]);
  const inChatSearchSenders = useMemo(() => {
    const map = new Map<string, string>();
    for (const msg of chatMessages) {
      if (!msg.senderId || !msg.senderName) continue;
      map.set(msg.senderId, msg.senderName);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [chatMessages]);
  const filteredSearchResults = useMemo(() => {
    if (!activeChatId) return [] as Message[];
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const fromMs = searchDateFrom ? new Date(`${searchDateFrom}T00:00:00`).getTime() : null;
    const toMs = searchDateTo ? new Date(`${searchDateTo}T23:59:59.999`).getTime() : null;

    return chatMessages.filter((msg) => {
      if (msg.type === 'system') return false;

      if (normalizedQuery) {
        const haystack = (msg.content || '').toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }

      if (searchSenderId && msg.senderId !== searchSenderId) return false;
      if (searchMessageType && msg.type !== searchMessageType) return false;

      if (fromMs !== null || toMs !== null) {
        const timestamp = getMessageTimestampMs(msg);
        if (timestamp === null) return false;
        if (fromMs !== null && timestamp < fromMs) return false;
        if (toMs !== null && timestamp > toMs) return false;
      }

      return true;
    });
  }, [activeChatId, chatMessages, searchDateFrom, searchDateTo, searchMessageType, searchQuery, searchSenderId]);
  const activeSearchMessageId = filteredSearchResults[activeSearchResultIndex]?.id || null;
  const isIncognitoMode = Boolean(settings.incognitoMode);
  const typingLabel = useMemo(() => {
    if (typingUserNames.length === 0) return '';
    if (typingUserNames.length === 1) return `${typingUserNames[0]} ${t('chat.typing')}`;
    if (typingUserNames.length === 2) return `${typingUserNames[0]}, ${typingUserNames[1]} ${t('chat.typing')}`;
    return `${typingUserNames[0]}, ${typingUserNames[1]} +${typingUserNames.length - 2} ${t('chat.typing')}`;
  }, [t, typingUserNames]);
  const wallpaperStyle = useMemo(() => {
    if (!chat?.wallpaper) return undefined;
    return {
      backgroundImage: chat.wallpaper,
      backgroundSize: chat.wallpaper.includes('radial-gradient') ? '18px 18px' : 'cover',
      backgroundPosition: 'center',
    } as CSSProperties;
  }, [chat?.wallpaper]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const jumpToSearchResult = useCallback(
    (index: number) => {
      const normalizedIndex = Math.max(0, Math.min(index, filteredSearchResults.length - 1));
      const target = filteredSearchResults[normalizedIndex];
      if (!target) return;
      setActiveSearchResultIndex(normalizedIndex);
      const node = messageRefs.current[target.id];
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    [filteredSearchResults],
  );

  useEffect(() => {
    if (!activeChatId) return;
    let cancelled = false;

    const syncChatHistory = async () => {
      try {
        const localMessages = await e2eChat.loadChatHistory(activeChatId, user?.id || '');
        if (cancelled) return;
        setMessagesForChat(activeChatId, localMessages);
      } catch (error) {
        console.error('[ChatView] Failed to load local chat history', error);
      }
    };

    syncChatHistory();

    return () => {
      cancelled = true;
    };
  }, [activeChatId, setMessagesForChat, user?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages.length, aiTyping, openClawTyping, scrollToBottom]);

  useEffect(() => {
    if (filteredSearchResults.length === 0) {
      setActiveSearchResultIndex(0);
      return;
    }
    if (activeSearchResultIndex >= filteredSearchResults.length) {
      setActiveSearchResultIndex(filteredSearchResults.length - 1);
    }
  }, [activeSearchResultIndex, filteredSearchResults.length]);

  useEffect(() => {
    if (!showMediaGallery || !activeChatId) return;
    let cancelled = false;
    setMediaGalleryLoading(true);

    const loadMedia = async () => {
      try {
        const type = mediaGalleryType === 'all' ? undefined : mediaGalleryType;
        const items = await getChatMedia(activeChatId, type);
        if (!cancelled) {
          setMediaGalleryItems(items);
        }
      } catch {
        if (!cancelled) {
          setMediaGalleryItems([]);
        }
      } finally {
        if (!cancelled) {
          setMediaGalleryLoading(false);
        }
      }
    };

    void loadMedia();

    return () => {
      cancelled = true;
    };
  }, [activeChatId, mediaGalleryType, showMediaGallery]);

  useEffect(() => {
    setReplyToMessage(null);
    setEditingMessage(null);
    setForwardMessage(null);
    setDeleteTargetMessage(null);
    setViewHistoryTarget(null);
    setSelectionMode(false);
    setSelectedMessageIds([]);
    setForwardWithoutSender(false);
    setSilentMode(false);
    setShowInChatSearch(false);
    setSearchQuery('');
    setSearchSenderId('');
    setSearchMessageType('');
    setSearchDateFrom('');
    setSearchDateTo('');
    setActiveSearchResultIndex(0);
    setShowMediaGallery(false);
    setMediaGalleryType('all');
    setMediaGalleryItems([]);
    setMediaGalleryLoading(false);
  }, [activeChatId]);

  useEffect(() => {
    if (pinnedMessages.length === 0) {
      if (pinnedIndex !== 0) setPinnedIndex(0);
      return;
    }
    if (pinnedIndex > pinnedMessages.length - 1) {
      setPinnedIndex(pinnedMessages.length - 1);
    }
  }, [pinnedIndex, pinnedMessages.length]);

  useEffect(() => {
    if (selectionMode && selectedMessageIds.length === 0) {
      setSelectionMode(false);
    }
  }, [selectedMessageIds.length, selectionMode]);

  useEffect(() => {
    if (!activeChatId || !wsJoinChat) return;
    wsJoinChat(activeChatId);
    return () => {
      wsLeaveChat?.(activeChatId);
    };
  }, [activeChatId, wsJoinChat, wsLeaveChat]);

  useEffect(() => {
    if (!wsConnected) return;
    setWasConnected(true);
  }, [wsConnected]);

  useEffect(() => {
    if (!activeChatId) return;
    if (typeof window === 'undefined') return;

    const onKeyDown = (event: KeyboardEvent) => {
      const isPrintScreen =
        event.key === 'PrintScreen' ||
        (event.metaKey && event.shiftKey && (event.key === '3' || event.key === '4'));
      if (!isPrintScreen) return;

      const systemMessage: Message = {
        id: crypto.randomUUID(),
        chatId: activeChatId,
        senderId: 'system',
        senderName: 'System',
        senderAvatar: '',
        content: t('msg.screenshotDetected'),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'system',
        status: 'delivered',
        isMe: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      receiveMessage(activeChatId, systemMessage);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeChatId, receiveMessage, t]);

  const refreshOutboxState = useCallback(() => {
    setOutboxSize(getOutboxSize());
    if (!activeChatId) {
      setOutboxMessageIndicators({});
      return;
    }
    setOutboxMessageIndicators(getOutboxMessageIndicators(activeChatId));
  }, [activeChatId]);

  useEffect(() => {
    refreshOutboxState();

    if (typeof window === 'undefined') return;

    const handleOutboxUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<OutboxUpdatedDetail>;
      const nextSize = customEvent.detail?.size;
      if (typeof nextSize === 'number') {
        setOutboxSize(nextSize);
      } else {
        setOutboxSize(getOutboxSize());
      }
      if (activeChatId) {
        setOutboxMessageIndicators(getOutboxMessageIndicators(activeChatId));
      }
    };

    window.addEventListener(OUTBOX_UPDATED_EVENT, handleOutboxUpdated);
    return () => {
      window.removeEventListener(OUTBOX_UPDATED_EVENT, handleOutboxUpdated);
    };
  }, [activeChatId, refreshOutboxState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    const handleQueueDelivered = (event: Event) => {
      const customEvent = event as CustomEvent<RelayQueueDeliveredDetail>;
      const detail = parseRelayQueueDeliveredPayload(customEvent.detail);
      if (!shouldShowRelayQueueDeliveredBanner(detail)) return;

      setQueueReplayInfo({
        delivered: detail.delivered,
        dropped: detail.dropped,
        remaining: detail.remaining,
      });

      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => setQueueReplayInfo(null), 8000);
    };

    window.addEventListener(RELAY_QUEUE_DELIVERED_EVENT, handleQueueDelivered);
    return () => {
      window.removeEventListener(RELAY_QUEUE_DELIVERED_EVENT, handleQueueDelivered);
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setE2eInitialized(false);
      setE2eError(null);
      return;
    }

    setE2eInitialized(e2eProviderInitialized);
    if (e2eProviderError) {
      setE2eError(e2eProviderError);
    } else if (e2eProviderInitialized) {
      setE2eError(null);
    }
  }, [e2eProviderError, e2eProviderInitialized, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const unsubscribeIncoming = onIncomingEncryptedMessage(async (envelope) => {
      const currentChatId = activeChatIdRef.current;
      if (!currentChatId) return;

      const result = await e2eChat.decryptIncomingMessage(envelope, currentChatId);
      if (result.success && result.decryptedMessage) {
        receiveMessageRef.current(currentChatId, result.decryptedMessage);
      } else if (result.error) {
        console.error('[ChatView] Failed to decrypt message:', result.error);
        toast.error(tRef.current('chat.decryptFailed'));
      }
    });

    return () => {
      unsubscribeIncoming();
    };
  }, [onIncomingEncryptedMessage, user?.id]);

  // Ensure E2E session when switching chats
  useEffect(() => {
    if (!activeChatId || !e2eInitialized || !e2eRecipientId) return;

    const ensureE2ESession = async () => {
      const chatState = e2eChat.getChatState(e2eRecipientId);
      if (!chatState.hasSession) {
        const success = await e2eChat.ensureSession(activeChatId, e2eRecipientId);
        if (!success) {
          setE2eError(tRef.current('chat.e2eSessionFailed'));
        }
      }
    };

    void ensureE2ESession();
  }, [activeChatId, e2eInitialized, e2eRecipientId]);

  const persistMessageStatus = useCallback(
    async (messageId: string, status: 'sending' | 'sent' | 'delivered' | 'read', chatId?: string) => {
      const path = `/api/messages/${messageId}`;
      try {
        const res = await fetch(path, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (res.ok) return;
        if (res.status === 401 || res.status === 403) return;
        enqueueOutboxTask({
          kind: 'api_request',
          chatId: chatId || activeChatId || 'unknown-chat',
          messageId,
          payload: {
            method: 'PATCH',
            path,
            body: { status },
          },
        });
      } catch {
        enqueueOutboxTask({
          kind: 'api_request',
          chatId: chatId || activeChatId || 'unknown-chat',
          messageId,
          payload: {
            method: 'PATCH',
            path,
            body: { status },
          },
        });
      }
    },
    [activeChatId],
  );

  useEffect(() => {
    if (!activeChatId || !wsConnected || !wsSendReadReceipt || !settings.readReceipts || isIncognitoMode) return;

    const unreadIncoming = chatMessages.filter(
      (m) => !m.isMe && m.type !== 'system' && m.status !== 'read',
    );
    if (unreadIncoming.length === 0) return;

    unreadIncoming.forEach((m) => {
      wsSendReadReceipt(activeChatId, m.id);
      setMessageStatus(activeChatId, m.id, 'read');
      void persistMessageStatus(m.id, 'read', activeChatId);
    });
  }, [
    activeChatId,
    chatMessages,
    persistMessageStatus,
    setMessageStatus,
    settings.readReceipts,
    isIncognitoMode,
    wsConnected,
    wsSendReadReceipt,
  ]);

  const moderateBeforeSend = useCallback(
    async (content: string, isE2E: boolean = false): Promise<{
      result: ModerationResult;
      blocked: boolean;
      flags: Array<{ category: string; severity: 'low' | 'medium' | 'high'; description: string }>;
      suggestion: string | null;
    }> => {
      const failClosedFlags: Array<{ category: string; severity: 'low' | 'medium' | 'high'; description: string }> = [
        {
          category: 'moderation_error',
          severity: 'high',
          description: t('moderation.serviceUnavailableBlocked'),
        },
      ];

      const failClosedResult: ModerationResult = {
        isSafe: false,
        riskLevel: 'high',
        categories: ['moderation_error'],
        warning: t('moderation.serviceUnavailableBlocked'),
        suggestedAction: null,
        timestamp: new Date().toISOString(),
      };

      try {
        let data: OpenClawModerationResponse = {};

        if (isE2E) {
          // Zero-knowledge OpenClaw (Local Offline Evaluator)
          const localResult = runLocalOpenClaw(content);
          data = {
            success: true,
            moderated: !localResult.isSafe,
            blocked: localResult.blocked,
            flags: localResult.flags || [],
            suggestion: localResult.suggestedAction,
            isSafe: localResult.isSafe,
            riskLevel: localResult.riskLevel,
            categories: localResult.categories,
            warning: localResult.warning
          };
        } else {
          // Standard server API check
          const response = await fetch('/api/openclaw/moderate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: content,
              messageId: `draft-${Date.now()}`,
              chatContext: chatMessages.slice(-8).map((m) => m.content),
            }),
          });
          
          if (!response.ok) {
            return {
              result: failClosedResult,
              blocked: true,
              flags: failClosedFlags,
              suggestion: null,
            };
          }
          data = (await response.json()) as OpenClawModerationResponse;
        }

        if (data.success === false) {
          return {
            result: failClosedResult,
            blocked: true,
            flags: failClosedFlags,
            suggestion: null,
          };
        }

        const flags = data.flags || [];
        const riskLevel = data.riskLevel ?? riskFromFlags(flags);
        const categories = data.categories ?? flags.map((f) => f.category);
        const warning = data.warning ?? (flags[0]?.description || null);
        const suggestion = (data.suggestion ?? data.suggestedAction ?? null) || null;
        const blocked = Boolean(
          data.blocked ||
            riskLevel === 'high' ||
            riskLevel === 'critical' ||
            flags.some((f) => f.severity === 'high'),
        );

        const result: ModerationResult = {
          isSafe: !Boolean(data.moderated || flags.length > 0),
          riskLevel,
          categories,
          warning,
          suggestedAction: suggestion,
          timestamp: new Date().toISOString(),
        };

        return { result, blocked, flags, suggestion };
      } catch {
        return {
          result: failClosedResult,
          blocked: true,
          flags: failClosedFlags,
          suggestion: null,
        };
      }
    },
    [chatMessages, t],
  );

  const persistMessage = useCallback(
    async (payload: Record<string, unknown>) => {
      try {
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          return { ok: true, shouldBlock: false, message: null as string | null };
        }

        let data: { error?: string } = {};
        try {
          data = (await res.json()) as { error?: string };
        } catch {
          data = {};
        }

        if (res.status === 401) {
          return { ok: false, shouldBlock: true, message: t('auth.signInAgain') };
        }

        if (res.status === 403) {
          return {
            ok: false,
            shouldBlock: true,
            message: data.error || t('moderation.messageFlagged'),
          };
        }

        return {
          ok: false,
          shouldBlock: false,
          message: data.error || t('network.savedLocally'),
        };
      } catch {
        return {
          ok: false,
          shouldBlock: false,
          message: t('network.savedLocallyOffline'),
        };
      }
    },
    [t],
  );

  const handleSend = useCallback(
    async (content: string) => {
      if (!activeChatId) return;
      if (editingMessage) {
        const nextContent = content.trim();
        if (!nextContent) return;
        const isE2EChat = Boolean(chat?.type === 'private' && chat?.isEncrypted);
        const moderated = await moderateBeforeSend(nextContent, isE2EChat);
        if (moderated.blocked || !moderated.result.isSafe) {
          toast.error(t('moderation.messageFlagged'));
          return;
        }

        const editPath = `/api/messages/${editingMessage.id}`;
        try {
          const res = await fetch(editPath, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: nextContent }),
          });

          if (res.status === 403) {
            toast.error(t('msg.editForbidden'));
            return;
          }

          if (res.status === 401) {
            toast.error(t('auth.signInAgain'));
            return;
          }

          if (!res.ok) {
            enqueueOutboxTask({
              kind: 'api_request',
              chatId: activeChatId,
              messageId: editingMessage.id,
              payload: {
                method: 'PATCH',
                path: editPath,
                body: { content: nextContent },
              },
            });
            toast.error(t('msg.editSaveFailed'));
          }
        } catch {
          enqueueOutboxTask({
            kind: 'api_request',
            chatId: activeChatId,
            messageId: editingMessage.id,
            payload: {
              method: 'PATCH',
              path: editPath,
              body: { content: nextContent },
            },
          });
        }

        editMessageContent(activeChatId, editingMessage.id, nextContent);

        const editWsPayload = {
          event: 'edit',
          id: editingMessage.id,
          chatId: activeChatId,
          senderId: senderContext.id,
          senderName: senderContext.name,
          senderAvatar: senderContext.avatar,
          content: nextContent,
          type: editingMessage.type,
          status: editingMessage.status,
          isEdited: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        } satisfies Record<string, unknown>;
        const editWsSent =
          wsConnected && wsSendMessageToChat ? wsSendMessageToChat(activeChatId, editWsPayload) : false;
        if (!editWsSent) {
          enqueueOutboxTask({
            kind: 'ws_broadcast',
            chatId: activeChatId,
            messageId: editingMessage.id,
            payload: editWsPayload,
          });
        }

        setEditingMessage(null);
        toast.success(t('msg.editSaveSuccess'));
        return;
      }

      const replyTo = replyToMessage
        ? {
            id: replyToMessage.id,
            senderName: replyToMessage.senderName,
            content: (replyToMessage.content || '').slice(0, 280),
            type: replyToMessage.type,
          }
        : undefined;
      const quoteSegment = replyToMessage?.quoteSegment;

      // Check if this chat uses E2E encryption
      const isE2EChat = Boolean(
        chat?.type === 'private' &&
          (chat?.isEncrypted || chat?.encryptionType === 'p2p') &&
          e2eRecipientId,
      );

      // Chat E2E state is already extracted above
      const moderated = await moderateBeforeSend(content, isE2EChat);

      if (moderated.blocked) {
        toast.error(t('moderation.messageFlagged'));
        return;
      }

      if (!moderated.result.isSafe) {
        setModerationDialog({
          open: true,
          originalContent: content,
          result: moderated.result,
          flags: moderated.flags,
          suggestion: moderated.suggestion,
        });
        return;
      }

      const msgId = crypto.randomUUID();

      if (isE2EChat && e2eInitialized && e2eRecipientId) {
        // E2E encrypted message flow
        const e2eResult = await e2eChat.sendEncryptedMessage(
          activeChatId,
          senderContext.id,
          e2eRecipientId,
          content,
        );

        if (e2eResult.success && e2eResult.encrypted) {
          // Store the encrypted envelope as the message content
          const encryptedContent = JSON.stringify(e2eResult.encrypted);
          const persistPayload = {
            id: msgId,
            chatId: activeChatId,
            content: encryptedContent,
            type: 'text',
            replyTo,
            isEncrypted: true,
            silent: silentMode,
            quoteSegment,
          } satisfies Record<string, unknown>;

          // Persist to server (encrypted blob only)
          const persist = { ok: true, shouldBlock: false, message: null }; // E2E override, prevent API leak!

          // Add to local store with decrypted content for display
          sendMessage(activeChatId, content, {
            id: msgId,
            replyTo,
            status: 'sending',
            silent: silentMode,
            quoteSegment,
          });
          setMessageStatus(activeChatId, msgId, 'sent');

          if (!persist.ok && persist.message) {
            toast.error(persist.message);
            enqueueOutboxTask({
              kind: 'api_persist',
              chatId: activeChatId,
              messageId: msgId,
              payload: persistPayload,
            });
          }
        } else {
          // E2E encryption failed — fall back to plaintext with warning
          setE2eError(e2eResult.error || t('chat.e2eEncryptFailed'));
          toast.warning(t('chat.sentWithoutEncryption'));

          // Fall through to plaintext flow
          const persistPayload = {
            id: msgId,
            chatId: activeChatId,
            content,
            type: 'text',
            replyTo,
            silent: silentMode,
            quoteSegment,
          } satisfies Record<string, unknown>;
          const persist = { ok: true, shouldBlock: false, message: null }; // E2E override, prevent API leak!
          if (persist.shouldBlock) {
            toast.error(persist.message || t('moderation.messageFlagged'));
            return;
          }

          sendMessage(activeChatId, content, {
            id: msgId,
            replyTo,
            status: 'sending',
            silent: silentMode,
            quoteSegment,
          });
          setMessageStatus(activeChatId, msgId, 'sent');
          if (!persist.ok && persist.message) {
            toast.error(persist.message);
            enqueueOutboxTask({
              kind: 'api_persist',
              chatId: activeChatId,
              messageId: msgId,
              payload: persistPayload,
            });
          }

          const wsPayload = {
            id: msgId,
            chatId: activeChatId,
            senderId: senderContext.id,
            senderName: senderContext.name,
            senderAvatar: senderContext.avatar,
            content,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'text',
            status: 'sent',
            replyTo,
            silent: silentMode,
            quoteSegment,
          } satisfies Record<string, unknown>;

          const wsSent = wsConnected && wsSendMessageToChat ? wsSendMessageToChat(activeChatId, wsPayload) : false;
          if (!wsSent) {
            enqueueOutboxTask({
              kind: 'ws_broadcast',
              chatId: activeChatId,
              messageId: msgId,
              payload: wsPayload,
            });
          }

          setReplyToMessage(null);
          return;
        }
      } else {
        // Standard plaintext message flow
        const persistPayload = {
          id: msgId,
          chatId: activeChatId,
          content,
          type: 'text',
          replyTo,
          silent: silentMode,
          quoteSegment,
        } satisfies Record<string, unknown>;
        const persist = await persistMessage(persistPayload);
        if (persist.shouldBlock) {
          toast.error(persist.message || t('moderation.messageFlagged'));
          return;
        }

        sendMessage(activeChatId, content, {
          id: msgId,
          replyTo,
          status: 'sending',
          silent: silentMode,
          quoteSegment,
        });
        setMessageStatus(activeChatId, msgId, 'sent');
        if (!persist.ok && persist.message) {
          toast.error(persist.message);
          enqueueOutboxTask({
            kind: 'api_persist',
            chatId: activeChatId,
            messageId: msgId,
            payload: persistPayload,
          });
        }

        const wsPayload = {
          id: msgId,
          chatId: activeChatId,
          senderId: senderContext.id,
          senderName: senderContext.name,
          senderAvatar: senderContext.avatar,
          content,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'text',
          status: 'sent',
          replyTo,
          silent: silentMode,
          quoteSegment,
        } satisfies Record<string, unknown>;

        const wsSent = wsConnected && wsSendMessageToChat ? wsSendMessageToChat(activeChatId, wsPayload) : false;
        if (!wsSent) {
          enqueueOutboxTask({
            kind: 'ws_broadcast',
            chatId: activeChatId,
            messageId: msgId,
            payload: wsPayload,
          });
        }
      }

      setReplyToMessage(null);
    },
    [
      activeChatId,
      chat,
      e2eRecipientId,
      e2eInitialized,
      editMessageContent,
      editingMessage,
      moderateBeforeSend,
      persistMessage,
      replyToMessage,
      sendMessage,
      setMessageStatus,
      silentMode,
      t,
      senderContext.avatar,
      senderContext.id,
      senderContext.name,
      wsConnected,
      wsSendMessageToChat,
    ],
  );

  const handleSendFile = useCallback(
    async (file: File) => {
      if (!activeChatId) return;
      if (file.size > MAX_UPLOAD_FILE_SIZE) {
        toast.error(t('msg.fileTooLarge'));
        return;
      }
      if (file.type && !ALLOWED_UPLOAD_MIME_TYPES.has(file.type)) {
        toast.error(t('msg.fileTypeNotAllowed'));
        return;
      }
      const replyTo = replyToMessage
        ? {
            id: replyToMessage.id,
            senderName: replyToMessage.senderName,
            content: (replyToMessage.content || '').slice(0, 280),
            type: replyToMessage.type,
          }
        : undefined;

      try {
        const isE2EChat = Boolean(
          chat?.type === 'private' &&
            (chat?.isEncrypted || chat?.encryptionType === 'p2p') &&
            e2eRecipientId,
        );
        let fileToUpload: Blob | File = file;
        let e2eFileData: { key?: string; iv?: string; tag?: string } = {};

        if (isE2EChat && e2eInitialized) {
          const encrypted = await encryptMediaFile(file);
          const encryptedBuffer = new ArrayBuffer(encrypted.encryptedData.byteLength);
          new Uint8Array(encryptedBuffer).set(encrypted.encryptedData);
          fileToUpload = new Blob([encryptedBuffer], { type: 'application/octet-stream' });
          e2eFileData = {
             key: bytesToBase64(encrypted.encryptionKey),
             iv: bytesToBase64(encrypted.iv),
             tag: bytesToBase64(encrypted.tag),
          };
        }

        const formData = new FormData();
        formData.append('file', fileToUpload, isE2EChat ? 'encrypted.bin' : file.name);

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        const uploadData = (await uploadRes.json()) as {
          url?: string;
          error?: string;
          mimeType?: string;
          filename?: string;
          size?: number;
        };

        if (!uploadRes.ok || !uploadData.url) {
          throw new Error(uploadData.error || 'Upload failed');
        }

        const mediaType = file.type.startsWith('image/')
          ? 'image'
          : file.type.startsWith('audio/')
            ? 'audio'
            : 'file';
        const previewContent =
          mediaType === 'image'
            ? t('common.image')
            : mediaType === 'audio'
              ? t('common.voiceMessage')
              : tf('common.fileNamed', { name: uploadData.filename || file.name });
        const messageType = mediaType === 'audio' ? 'voice' : 'media';
        const msgId = crypto.randomUUID();
        const persistPayload = {
          id: msgId,
          chatId: activeChatId,
          content: previewContent,
          type: messageType,
          mediaUrl: uploadData.url,
          mediaType,
          mediaName: uploadData.filename || file.name,
          mediaSize: uploadData.size || file.size,
          mediaMimeType: uploadData.mimeType || file.type || 'application/octet-stream',
          replyTo,
          silent: silentMode,
        } satisfies Record<string, unknown>;
        const persist = { ok: true, shouldBlock: false, message: null }; // E2E Override for files

        sendMediaMessage(
          activeChatId,
          {
            mediaUrl: uploadData.url,
            mediaType,
            mediaName: uploadData.filename || file.name,
            mediaSize: uploadData.size || file.size,
            mediaMimeType: uploadData.mimeType || file.type || 'application/octet-stream',
          },

          { id: msgId, replyTo, previewContent, messageType, status: 'sending', silent: silentMode },
        );
        setMessageStatus(activeChatId, msgId, 'sent');
        if (!persist.ok && persist.message) {
          toast.error(persist.message);
          enqueueOutboxTask({
            kind: 'api_persist',
            chatId: activeChatId,
            messageId: msgId,
            payload: persistPayload,
          });
        }

        if (isE2EChat && e2eInitialized && e2eRecipientId) {
          const e2ePayload = JSON.stringify({
             type: 'media',
             content: previewContent,
             mediaData: {
                url: uploadData.url,
                type: messageType,
                name: uploadData.filename || file.name,
                size: uploadData.size || file.size,
                mimeType: uploadData.mimeType || file.type || 'application/octet-stream',
                key: e2eFileData.key,
                iv: e2eFileData.iv,
                tag: e2eFileData.tag,
             }
          });
          await e2eChat.sendEncryptedMessage(activeChatId, senderContext.id, e2eRecipientId, e2ePayload);
        } else {
          const wsPayload = {
            id: msgId,
            chatId: activeChatId,
            senderId: senderContext.id,
            senderName: senderContext.name,
            senderAvatar: senderContext.avatar,
            content: previewContent,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: messageType,
            status: 'sent',
            mediaUrl: uploadData.url,
            mediaType,
            mediaName: uploadData.filename || file.name,
            mediaSize: uploadData.size || file.size,
            mediaMimeType: uploadData.mimeType || file.type || 'application/octet-stream',
            replyTo,
            silent: silentMode,
          } satisfies Record<string, unknown>;

          const wsSent = wsConnected && wsSendMessageToChat ? wsSendMessageToChat(activeChatId, wsPayload) : false;
          if (!wsSent) {
            enqueueOutboxTask({
              kind: 'ws_broadcast',
              chatId: activeChatId,
              messageId: msgId,
              payload: wsPayload,
            });
          }
        }
        setReplyToMessage(null);
      } catch {
        toast.error(t('msg.uploadFailed'));
      }
    },
    [
      activeChatId,
      chat?.encryptionType,
      chat?.isEncrypted,
      chat?.type,
      e2eRecipientId,
      e2eInitialized,
      replyToMessage,
      sendMediaMessage,
      setMessageStatus,
      t,
      tf,
      senderContext.avatar,
      senderContext.id,
      senderContext.name,
      silentMode,
      wsConnected,
      wsSendMessageToChat,
    ],
  );

  const handleSendGif = useCallback(
    async (gif: GIFResult) => {
      if (!activeChatId) return;
      if (!gif.url) {
        toast.error(t('msg.uploadFailed'));
        return;
      }

      const replyTo = replyToMessage
        ? {
            id: replyToMessage.id,
            senderName: replyToMessage.senderName,
            content: (replyToMessage.content || '').slice(0, 280),
            type: replyToMessage.type,
          }
        : undefined;

      const msgId = crypto.randomUUID();
      const normalizedTitle = (gif.title || 'GIF').trim() || 'GIF';
      const previewContent = `GIF: ${normalizedTitle.slice(0, 80)}`;
      const persistPayload = {
        id: msgId,
        chatId: activeChatId,
        content: previewContent,
        type: 'media',
        mediaUrl: gif.url,
        mediaType: 'image',
        mediaName: `${normalizedTitle.slice(0, 60)}.gif`,
        mediaSize: 0,
        mediaMimeType: 'image/gif',
        replyTo,
        silent: silentMode,
      } satisfies Record<string, unknown>;
      const persist = await persistMessage(persistPayload);
      if (persist.shouldBlock) {
        toast.error(persist.message || t('moderation.messageFlagged'));
        return;
      }

      sendMediaMessage(
        activeChatId,
        {
          mediaUrl: gif.url,
          mediaType: 'image',
          mediaName: `${normalizedTitle.slice(0, 60)}.gif`,
          mediaSize: 0,
          mediaMimeType: 'image/gif',
        },
        { id: msgId, replyTo, previewContent, messageType: 'media', status: 'sending', silent: silentMode },
      );
      setMessageStatus(activeChatId, msgId, 'sent');

      if (!persist.ok && persist.message) {
        toast.error(persist.message);
        enqueueOutboxTask({
          kind: 'api_persist',
          chatId: activeChatId,
          messageId: msgId,
          payload: persistPayload,
        });
      }

      const wsPayload = {
        id: msgId,
        chatId: activeChatId,
        senderId: senderContext.id,
        senderName: senderContext.name,
        senderAvatar: senderContext.avatar,
        content: previewContent,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'media',
        status: 'sent',
        mediaUrl: gif.url,
        mediaType: 'image',
        mediaName: `${normalizedTitle.slice(0, 60)}.gif`,
        mediaSize: 0,
        mediaMimeType: 'image/gif',
        replyTo,
        silent: silentMode,
      } satisfies Record<string, unknown>;

      const wsSent = wsConnected && wsSendMessageToChat ? wsSendMessageToChat(activeChatId, wsPayload) : false;
      if (!wsSent) {
        enqueueOutboxTask({
          kind: 'ws_broadcast',
          chatId: activeChatId,
          messageId: msgId,
          payload: wsPayload,
        });
      }

      setReplyToMessage(null);
    },
    [
      activeChatId,
      persistMessage,
      replyToMessage,
      sendMediaMessage,
      setMessageStatus,
      t,
      senderContext.avatar,
      senderContext.id,
      senderContext.name,
      silentMode,
      wsConnected,
      wsSendMessageToChat,
    ],
  );

  const handleSendSticker = useCallback(
    async (sticker: Sticker) => {
      if (!activeChatId) return;
      const content = (sticker.emoji || '').trim();
      if (!content) {
        toast.error(t('msg.uploadFailed'));
        return;
      }

      const replyTo = replyToMessage
        ? {
            id: replyToMessage.id,
            senderName: replyToMessage.senderName,
            content: (replyToMessage.content || '').slice(0, 280),
            type: replyToMessage.type,
          }
        : undefined;

      const msgId = crypto.randomUUID();
      const persistPayload = {
        id: msgId,
        chatId: activeChatId,
        content,
        type: 'text',
        replyTo,
        silent: silentMode,
      } satisfies Record<string, unknown>;
      const persist = await persistMessage(persistPayload);
      if (persist.shouldBlock) {
        toast.error(persist.message || t('moderation.messageFlagged'));
        return;
      }

      sendMessage(activeChatId, content, { id: msgId, replyTo, status: 'sending', silent: silentMode });
      setMessageStatus(activeChatId, msgId, 'sent');

      if (!persist.ok && persist.message) {
        toast.error(persist.message);
        enqueueOutboxTask({
          kind: 'api_persist',
          chatId: activeChatId,
          messageId: msgId,
          payload: persistPayload,
        });
      }

      const wsPayload = {
        id: msgId,
        chatId: activeChatId,
        senderId: senderContext.id,
        senderName: senderContext.name,
        senderAvatar: senderContext.avatar,
        content,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'text',
        status: 'sent',
        replyTo,
        silent: silentMode,
      } satisfies Record<string, unknown>;

      const wsSent = wsConnected && wsSendMessageToChat ? wsSendMessageToChat(activeChatId, wsPayload) : false;
      if (!wsSent) {
        enqueueOutboxTask({
          kind: 'ws_broadcast',
          chatId: activeChatId,
          messageId: msgId,
          payload: wsPayload,
        });
      }

      setReplyToMessage(null);
    },
    [
      activeChatId,
      persistMessage,
      replyToMessage,
      sendMessage,
      setMessageStatus,
      t,
      senderContext.avatar,
      senderContext.id,
      senderContext.name,
      silentMode,
      wsConnected,
      wsSendMessageToChat,
    ],
  );

  const handleModerationUseSuggestion = useCallback(async () => {
    if (!activeChatId || !moderationDialog.result) return;

    const content = (moderationDialog.suggestion || '').trim();
    if (!content) {
      toast.error(t('moderation.messageFlagged'));
      return;
    }

    // Re-run moderation on suggested text to prevent bypasses.
    const remoderated = await moderateBeforeSend(content);
    if (remoderated.blocked || !remoderated.result.isSafe) {
      toast.error(t('moderation.messageFlagged'));
      return;
    }

    const replyTo = replyToMessage
      ? {
          id: replyToMessage.id,
          senderName: replyToMessage.senderName,
          content: (replyToMessage.content || '').slice(0, 280),
          type: replyToMessage.type,
        }
      : undefined;
    const msgId = crypto.randomUUID();
    const persistPayload = {
      id: msgId,
      chatId: activeChatId,
      content,
      type: 'text',
      replyTo,
      silent: silentMode,
    } satisfies Record<string, unknown>;
    const persist = await persistMessage(persistPayload);
    if (persist.shouldBlock) {
      toast.error(persist.message || t('moderation.messageFlagged'));
      return;
    }
    sendMessage(activeChatId, content, { id: msgId, replyTo, status: 'sending', silent: silentMode });
    setMessageStatus(activeChatId, msgId, 'sent');
    if (!persist.ok && persist.message) {
      toast.error(persist.message);
      enqueueOutboxTask({
        kind: 'api_persist',
        chatId: activeChatId,
        messageId: msgId,
        payload: persistPayload,
      });
    }
    const wsPayload = {
      id: msgId,
      chatId: activeChatId,
      senderId: senderContext.id,
      senderName: senderContext.name,
      senderAvatar: senderContext.avatar,
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'text',
      status: 'sent',
      replyTo,
      silent: silentMode,
    } satisfies Record<string, unknown>;
    const wsSent = wsConnected && wsSendMessageToChat ? wsSendMessageToChat(activeChatId, wsPayload) : false;
    if (!wsSent) {
      enqueueOutboxTask({
        kind: 'ws_broadcast',
        chatId: activeChatId,
        messageId: msgId,
        payload: wsPayload,
      });
    }
    setModerationDialog({
      open: false,
      originalContent: '',
      result: null,
      flags: [],
      suggestion: null,
    });
    setReplyToMessage(null);
  }, [
    activeChatId,
    moderateBeforeSend,
    moderationDialog,
    persistMessage,
    replyToMessage,
    sendMessage,
    setMessageStatus,
    t,
    senderContext.avatar,
    senderContext.id,
    senderContext.name,
    silentMode,
    wsConnected,
    wsSendMessageToChat,
  ]);

  const handleModerationDiscard = useCallback(() => {
    setModerationDialog({
      open: false,
      originalContent: '',
      result: null,
      flags: [],
      suggestion: null,
    });
  }, []);

  const handleTypingChange = useCallback(
    (isTyping: boolean) => {
      if (!activeChatId || !wsConnected || !wsSendTyping || !settings.typingIndicators || isIncognitoMode) return;
      wsSendTyping(activeChatId, isTyping);
    },
    [activeChatId, isIncognitoMode, settings.typingIndicators, wsConnected, wsSendTyping],
  );

  const handleReplyMessage = useCallback((msg: Message) => {
    setEditingMessage(null);
    setReplyToMessage(msg);
  }, []);

  const handleEditMessage = useCallback((msg: Message) => {
    if (!msg.isMe) return;
    if (msg.type !== 'text') return;
    setReplyToMessage(null);
    setForwardMessage(null);
    setEditingMessage(msg);
  }, []);

  const buildForwardedFrom = useCallback(
    (source: Message) => {
      if (forwardWithoutSender) return undefined;
      return {
        id: source.id,
        senderName: source.senderName,
        content: (source.content || '').slice(0, 280),
        type: source.type,
        fromChatName: chat?.name,
      };
    },
    [chat?.name, forwardWithoutSender],
  );

  const handleForwardMessage = useCallback((msg: Message) => {
    setForwardMessage(msg);
  }, []);

  const handleForwardToChat = useCallback(
    async (targetChatId: string) => {
      if (!forwardMessage) return;

      const targetChat = chats.find((c) => c.id === targetChatId);
      const forwardedFrom = buildForwardedFrom(forwardMessage);
      const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (
        forwardMessage.mediaUrl &&
        (forwardMessage.mediaType === 'image' || forwardMessage.mediaType === 'file' || forwardMessage.mediaType === 'audio')
      ) {
        const msgId = crypto.randomUUID();
        const isImage = forwardMessage.mediaType === 'image';
        const isAudio = forwardMessage.mediaType === 'audio';
        const previewContent =
          forwardMessage.content ||
          (isImage ? t('common.image') : isAudio ? t('common.voiceMessage') : t('common.attachment'));
        const mediaNameFallback = isImage ? t('common.image') : isAudio ? t('common.voiceMessage') : t('common.attachment');
        const mediaMimeFallback = isImage ? 'image/*' : isAudio ? 'audio/*' : 'application/octet-stream';
        const messageType = isAudio ? 'voice' : 'media';
        const persistPayload = {
          id: msgId,
          chatId: targetChatId,
          content: previewContent,
          type: messageType,
          mediaUrl: forwardMessage.mediaUrl,
          mediaType: forwardMessage.mediaType,
          mediaName: forwardMessage.mediaName || mediaNameFallback,
          mediaSize: forwardMessage.mediaSize || 0,
          mediaMimeType: forwardMessage.mediaMimeType || mediaMimeFallback,
          forwardedFrom,
        } satisfies Record<string, unknown>;
        const persist = await persistMessage(persistPayload);
        if (persist.shouldBlock) {
          toast.error(persist.message || t('moderation.messageFlagged'));
          return;
        }

        sendMediaMessage(
          targetChatId,
          {
            mediaUrl: forwardMessage.mediaUrl,
            mediaType: forwardMessage.mediaType,
            mediaName: forwardMessage.mediaName || mediaNameFallback,
            mediaSize: forwardMessage.mediaSize || 0,
            mediaMimeType: forwardMessage.mediaMimeType || mediaMimeFallback,
          },
          { id: msgId, forwardedFrom, previewContent, messageType, status: 'sending' },
        );
        setMessageStatus(targetChatId, msgId, 'sent');
        if (!persist.ok && persist.message) {
          toast.error(persist.message);
          enqueueOutboxTask({
            kind: 'api_persist',
            chatId: targetChatId,
            messageId: msgId,
            payload: persistPayload,
          });
        }

        const wsPayload = {
          id: msgId,
          chatId: targetChatId,
          senderId: senderContext.id,
          senderName: senderContext.name,
          senderAvatar: senderContext.avatar,
          content: previewContent,
          timestamp: ts,
          type: messageType,
          status: 'sent',
          mediaUrl: forwardMessage.mediaUrl,
          mediaType: forwardMessage.mediaType,
          mediaName: forwardMessage.mediaName,
          mediaSize: forwardMessage.mediaSize,
          mediaMimeType: forwardMessage.mediaMimeType,
          forwardedFrom,
        } satisfies Record<string, unknown>;
        const wsSent = wsConnected && wsSendMessageToChat ? wsSendMessageToChat(targetChatId, wsPayload) : false;
        if (!wsSent) {
          enqueueOutboxTask({
            kind: 'ws_broadcast',
            chatId: targetChatId,
            messageId: msgId,
            payload: wsPayload,
          });
        }
      } else {
        const content =
          (forwardMessage.content || '').trim() ||
          (forwardMessage.type === 'voice'
            ? t('common.voiceMessage')
            : forwardMessage.type === 'video-circle'
              ? t('common.videoMessage')
              : t('common.message'));

        const msgId = crypto.randomUUID();
        const persistPayload = {
          id: msgId,
          chatId: targetChatId,
          content,
          type: 'text',
          forwardedFrom,
        } satisfies Record<string, unknown>;
        const persist = await persistMessage(persistPayload);
        if (persist.shouldBlock) {
          toast.error(persist.message || t('moderation.messageFlagged'));
          return;
        }
        sendMessage(targetChatId, content, { id: msgId, forwardedFrom, status: 'sending' });
        setMessageStatus(targetChatId, msgId, 'sent');
        if (!persist.ok && persist.message) {
          toast.error(persist.message);
          enqueueOutboxTask({
            kind: 'api_persist',
            chatId: targetChatId,
            messageId: msgId,
            payload: persistPayload,
          });
        }

        const wsPayload = {
          id: msgId,
          chatId: targetChatId,
          senderId: senderContext.id,
          senderName: senderContext.name,
          senderAvatar: senderContext.avatar,
          content,
          timestamp: ts,
          type: 'text',
          status: 'sent',
          forwardedFrom,
        } satisfies Record<string, unknown>;
        const wsSent = wsConnected && wsSendMessageToChat ? wsSendMessageToChat(targetChatId, wsPayload) : false;
        if (!wsSent) {
          enqueueOutboxTask({
            kind: 'ws_broadcast',
            chatId: targetChatId,
            messageId: msgId,
            payload: wsPayload,
          });
        }
      }

      toast.success(tf('msg.forwardSuccess', { chat: targetChat?.name || t('msg.forwardFallbackChat') }));
      setForwardMessage(null);
      setForwardWithoutSender(false);
    },
    [
      buildForwardedFrom,
      chats,
      forwardMessage,
      persistMessage,
      sendMediaMessage,
      sendMessage,
      setMessageStatus,
      t,
      tf,
      senderContext.avatar,
      senderContext.id,
      senderContext.name,
      wsConnected,
      wsSendMessageToChat,
    ],
  );

  const handlePinMessage = useCallback(
    async (msg: Message) => {
      if (!activeChatId) return;
      const nextPinned = !msg.isPinned;
      toggleMessagePin(activeChatId, msg.id);
      const pinPath = `/api/messages/${msg.id}`;
      try {
        const res = await fetch(pinPath, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPinned: nextPinned }),
        });

        if (res.status === 401 || res.status === 403) {
          toggleMessagePin(activeChatId, msg.id);
          toast.error(res.status === 401 ? t('auth.signInAgain') : t('msg.pinForbidden'));
          return;
        }

        if (!res.ok) {
          enqueueOutboxTask({
            kind: 'api_request',
            chatId: activeChatId,
            messageId: msg.id,
            payload: {
              method: 'PATCH',
              path: pinPath,
              body: { isPinned: nextPinned },
            },
          });
          toast.error(t('msg.pinFailed'));
          return;
        }

        toast.success(msg.isPinned ? t('msg.unpinSuccess') : t('msg.pinSuccess'));
      } catch {
        enqueueOutboxTask({
          kind: 'api_request',
          chatId: activeChatId,
          messageId: msg.id,
          payload: {
            method: 'PATCH',
            path: pinPath,
            body: { isPinned: nextPinned },
          },
        });
        toast.error(t('msg.pinFailed'));
      }
    },
    [activeChatId, t, toggleMessagePin],
  );

  const formatMessageForCopy = useCallback((msg: Message) => {
    const lines: string[] = [];
    if (msg.forwardedFrom) {
      lines.push(`${t('msg.forwardedLabel')}: ${msg.forwardedFrom.senderName}`);
    }
    if (msg.replyTo) {
      lines.push(`${t('msg.reply')}: ${msg.replyTo.senderName} — ${msg.replyTo.content}`);
    }
    if (msg.quoteSegment) {
      lines.push(`${t('msg.quoteSegment')}: ${msg.quoteSegment.label}${msg.quoteSegment.note ? ` (${msg.quoteSegment.note})` : ''}`);
    }
    if (msg.silent) {
      lines.push(`[${t('msg.silent')}]`);
    }
    lines.push(msg.content?.trim() || msg.mediaUrl || '');
    return lines.filter((line) => line.trim().length > 0).join('\n');
  }, [t]);

  const handleCopyMessage = useCallback(async (msg: Message) => {
    const textToCopy = formatMessageForCopy(msg);
    if (!textToCopy) {
      toast.error(t('msg.copyNothing'));
      return;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      toast.success(t('msg.copy'));
    } catch {
      toast.error(t('msg.copyFailed'));
    }
  }, [formatMessageForCopy, t]);

  const handleDeleteMessage = useCallback((msg: Message) => {
    setDeleteTargetMessage(msg);
  }, []);

  const handleDeleteScope = useCallback(
    async (scope: 'me' | 'everyone') => {
      if (!activeChatId || !deleteTargetMessage) return;

      const target = deleteTargetMessage;
      const cleanupReferences = () => {
        if (replyToMessage?.id === target.id) {
          setReplyToMessage(null);
        }
        if (editingMessage?.id === target.id) {
          setEditingMessage(null);
        }
        if (forwardMessage?.id === target.id) {
          setForwardMessage(null);
        }
      };
      const clearLocal = () => {
        removeMessage(activeChatId, target.id);
        cleanupReferences();
      };

      if (scope === 'me') {
        clearLocal();
        setDeleteTargetMessage(null);
        toast.success(t('msg.deleteForMeSuccess'));
        return;
      }

      const targetCreatedAt = target.createdAt ? new Date(target.createdAt).getTime() : Date.now();
      const ageMs = Date.now() - targetCreatedAt;
      if (target.isMe && ageMs > DELETE_FOR_EVERYONE_LIMIT_MS) {
        toast.error(t('msg.deleteForEveryoneTimeLimit'));
        return;
      }

      const deletePath = `/api/messages/${target.id}`;
      try {
        const res = await fetch(deletePath, {
          method: 'DELETE',
        });

        if (res.status === 403) {
          toast.error(t('msg.deleteForbidden'));
          return;
        }

        if (res.status === 401) {
          toast.error(t('auth.signInAgain'));
          return;
        }

        // 200: deleted on server; 404: local-only message not found on server.
        if (!res.ok && res.status !== 404) {
          enqueueOutboxTask({
            kind: 'api_request',
            chatId: activeChatId,
            messageId: target.id,
            payload: {
              method: 'DELETE',
              path: deletePath,
            },
          });
        }
      } catch {
        enqueueOutboxTask({
          kind: 'api_request',
          chatId: activeChatId,
          messageId: target.id,
          payload: {
            method: 'DELETE',
            path: deletePath,
          },
        });
      }

      tombstoneMessage(activeChatId, target.id, {
        deletedBy: senderContext.id,
        deletedForEveryone: true,
      });
      cleanupReferences();

      const deleteWsPayload = {
        event: 'delete',
        id: target.id,
        chatId: activeChatId,
        senderId: senderContext.id,
        senderName: senderContext.name,
        senderAvatar: senderContext.avatar,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      } satisfies Record<string, unknown>;
      const deleteWsSent =
        wsConnected && wsSendMessageToChat ? wsSendMessageToChat(activeChatId, deleteWsPayload) : false;
      if (!deleteWsSent) {
        enqueueOutboxTask({
          kind: 'ws_broadcast',
          chatId: activeChatId,
          messageId: target.id,
          payload: deleteWsPayload,
        });
      }

      setDeleteTargetMessage(null);
      toast.success(t('msg.deleteForEveryoneSuccess'));
    },
    [
      activeChatId,
      deleteTargetMessage,
      editingMessage?.id,
      forwardMessage?.id,
      removeMessage,
      replyToMessage?.id,
      tombstoneMessage,
      t,
      senderContext.avatar,
      senderContext.id,
      senderContext.name,
      wsConnected,
      wsSendMessageToChat,
    ],
  );

  const handleQuoteSegment = useCallback((msg: Message) => {
    if (!msg.mediaUrl) return;
    const segment = window.prompt(t('msg.quoteSegmentPrompt'), '00:00-00:10');
    if (!segment) return;
    const note = window.prompt(t('msg.quoteSegmentNotePrompt'), '') || '';
    setReplyToMessage({
      ...msg,
      content: msg.content || msg.mediaName || t('common.attachment'),
      quoteSegment: {
        label: segment.trim(),
        note: note.trim() || undefined,
      },
    });
    setEditingMessage(null);
    setForwardMessage(null);
  }, [t]);

  const toggleSelection = useCallback((msg: Message) => {
    setSelectionMode(true);
    setSelectedMessageIds((current) =>
      current.includes(msg.id) ? current.filter((id) => id !== msg.id) : [...current, msg.id],
    );
  }, []);

  const clearSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedMessageIds([]);
  }, []);

  const selectedMessages = useMemo(
    () => chatMessages.filter((msg) => selectedMessageIds.includes(msg.id)),
    [chatMessages, selectedMessageIds],
  );

  const handleCopySelected = useCallback(async () => {
    const payload = selectedMessages
      .map((msg) => formatMessageForCopy(msg))
      .filter((line) => line.trim().length > 0)
      .join('\n\n');
    if (!payload) {
      toast.error(t('msg.copyNothing'));
      return;
    }
    try {
      await navigator.clipboard.writeText(payload);
      toast.success(t('msg.copy'));
      clearSelectionMode();
    } catch {
      toast.error(t('msg.copyFailed'));
    }
  }, [clearSelectionMode, formatMessageForCopy, selectedMessages, t]);

  const handleDeleteSelected = useCallback(() => {
    if (!activeChatId || selectedMessageIds.length === 0) return;
    for (const messageId of selectedMessageIds) {
      removeMessage(activeChatId, messageId);
    }
    toast.success(t('msg.deleteForMeSuccess'));
    clearSelectionMode();
  }, [activeChatId, clearSelectionMode, removeMessage, selectedMessageIds, t]);

  const handleAIMention = useCallback(
    async (message: string) => {
      if (!activeChatId || !chat) return;

      sendMessage(activeChatId, `@ai ${message}`);
      setAiTyping(true);
      const requestId = crypto.randomUUID();
      const responseMessageId = `ai-${Date.now()}-${requestId.slice(0, 8)}`;

      try {
        const recentMessages = (messages[activeChatId] || []).slice(-20).map((m) => ({
          role: m.isMe ? 'user' : 'assistant',
          senderName: m.senderName,
          content: m.content,
        }));

        const payload = {
          message,
          chatId: activeChatId,
          chatHistory: recentMessages,
          requestId,
          responseMessageId,
        };
        const res = await fetch('/api/ai-in-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.status === 401 || res.status === 403) {
          toast.error(t('ai.error'));
          return;
        }

        if (!res.ok) {
          enqueueOutboxTask({
            kind: 'api_request',
            chatId: activeChatId,
            messageId: responseMessageId,
            payload: {
              method: 'POST',
              path: '/api/ai-in-chat',
              body: payload,
            },
          });
          toast.error(t('ai.requestQueuedRetry'));
          return;
        }

        const data = (await res.json()) as {
          success?: boolean;
          response?: string;
          responseMessageId?: string | null;
        };
        if (!data.success || !data.response) {
          enqueueOutboxTask({
            kind: 'api_request',
            chatId: activeChatId,
            messageId: responseMessageId,
            payload: {
              method: 'POST',
              path: '/api/ai-in-chat',
              body: payload,
            },
          });
          toast.error(t('ai.requestQueuedRetry'));
          return;
        }

        const aiMessage: Message = {
          id: data.responseMessageId || responseMessageId,
          chatId: activeChatId,
          senderId: 'presidium-ai',
          senderName: t('msg.aiSender'),
          senderAvatar: '',
          content: data.response,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'ai',
          status: 'delivered',
          isMe: false,
          aiActions: [t('ai.summarize'), t('ai.translate'), t('ai.replyForMe'), t('ai.createTask')],
        };
        receiveMessage(activeChatId, aiMessage);
      } catch {
        const recentMessages = (messages[activeChatId] || []).slice(-20).map((m) => ({
          role: m.isMe ? 'user' : 'assistant',
          senderName: m.senderName,
          content: m.content,
        }));
        enqueueOutboxTask({
          kind: 'api_request',
          chatId: activeChatId,
          messageId: responseMessageId,
          payload: {
            method: 'POST',
            path: '/api/ai-in-chat',
            body: {
              message,
              chatId: activeChatId,
              chatHistory: recentMessages,
              requestId,
              responseMessageId,
            },
          },
        });
        toast.error(t('ai.requestQueuedRetry'));
      } finally {
        setAiTyping(false);
      }
    },
    [activeChatId, chat, messages, receiveMessage, sendMessage, t],
  );

  const handleOpenClawMention = useCallback(
    async (message: string, mode?: string) => {
      if (!activeChatId || !chat) return;

      sendMessage(activeChatId, `@openclaw ${message}`);
      setOpenClawTyping(true);
      const requestId = crypto.randomUUID();
      const responseMessageId = `oc-${Date.now()}-${requestId.slice(0, 8)}`;

      try {
        const recentMessages = (messages[activeChatId] || []).slice(-30).map((m) => ({
          role: m.isMe ? 'user' : 'assistant',
          senderName: m.senderName,
          content: m.content,
        }));

        const payload = {
          message,
          chatId: activeChatId,
          chatHistory: recentMessages,
          mode: mode || 'default',
          requestId,
          responseMessageId,
        };
        const res = await fetch('/api/openclaw/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.status === 401 || res.status === 403) {
          toast.error(t('openclaw.chatError'));
          return;
        }

        if (!res.ok) {
          enqueueOutboxTask({
            kind: 'api_request',
            chatId: activeChatId,
            messageId: responseMessageId,
            payload: {
              method: 'POST',
              path: '/api/openclaw/chat',
              body: payload,
            },
          });
          toast.error(t('openclaw.requestQueuedRetry'));
          return;
        }

        const data = (await res.json()) as {
          success?: boolean;
          response?: string;
          responseMessageId?: string | null;
        };
        if (!data.success || !data.response) {
          enqueueOutboxTask({
            kind: 'api_request',
            chatId: activeChatId,
            messageId: responseMessageId,
            payload: {
              method: 'POST',
              path: '/api/openclaw/chat',
              body: payload,
            },
          });
          toast.error(t('openclaw.requestQueuedRetry'));
          return;
        }

        const ocMessage: Message = {
          id: data.responseMessageId || responseMessageId,
          chatId: activeChatId,
          senderId: 'openclaw',
          senderName: t('msg.openclawSender'),
          senderAvatar: '',
          content: data.response,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'openclaw',
          status: 'delivered',
          isMe: false,
          openClawActions: OPENCLAW_SUGGESTION_CHIPS.map((c) => c.label),
        };
        receiveMessage(activeChatId, ocMessage);
      } catch {
        const recentMessages = (messages[activeChatId] || []).slice(-30).map((m) => ({
          role: m.isMe ? 'user' : 'assistant',
          senderName: m.senderName,
          content: m.content,
        }));
        enqueueOutboxTask({
          kind: 'api_request',
          chatId: activeChatId,
          messageId: responseMessageId,
          payload: {
            method: 'POST',
            path: '/api/openclaw/chat',
            body: {
              message,
              chatId: activeChatId,
              chatHistory: recentMessages,
              mode: mode || 'default',
              requestId,
              responseMessageId,
            },
          },
        });
        toast.error(t('openclaw.requestQueuedRetry'));
      } finally {
        setOpenClawTyping(false);
      }
    },
    [OPENCLAW_SUGGESTION_CHIPS, activeChatId, chat, messages, receiveMessage, sendMessage, t],
  );

  const handleAvatarClick = useCallback(() => {
    if (chat && chat.type === 'private') {
      setView('contact-profile');
    }
  }, [chat, setView]);

  if (!chat) return null;

  const isGroup = chat.type === 'group';
  const isAIChat = chat.type === 'ai';
  const canShowLastSeen =
    settings.privacyLastSeen !== 'nobody' ||
    settings.lastSeenExceptions.includes(chat.id);
  const rawChatType = (chat as { type?: unknown })?.type;
  const showOutgoingStatusLabel = rawChatType === 'group' || rawChatType === 'channel';
  const isEncrypted = chat.isEncrypted;
  const encryptionType = chat.encryptionType;
  const supportsDirectE2E = isEncrypted && chat.type === 'private' && Boolean(e2eRecipientId);
  const relayStatusText = !wsConnected
    ? outboxSize > 0
      ? tf('outbox.waitingConnection', { count: outboxSize })
      : wasConnected
        ? t('relay.reconnecting')
        : t('relay.offline')
    : outboxSize > 0
      ? tf('outbox.syncing', { count: outboxSize })
      : null;
  const relayStatusTone = !wsConnected ? 'warn' : outboxSize > 0 ? 'info' : 'none';
  const queueReplayText = queueReplayInfo
    ? tf('relay.queueDeliveredSummary', {
        delivered: queueReplayInfo.delivered,
        dropped: queueReplayInfo.dropped,
        remaining: queueReplayInfo.remaining,
      })
    : null;

  return (
    <div className="relative flex h-full flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b bg-background/95 px-3 py-2.5 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 lg:hidden"
          onClick={goBack}
          aria-label={t('aria.goBack')}
        >
          <ArrowLeft className="size-5" />
        </Button>

        <div
          role="button"
          tabIndex={0}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={handleAvatarClick}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleAvatarClick();
            }
          }}
        >
          <Avatar className="size-10">
            <AvatarFallback
              className={cn(
                'text-sm font-semibold',
                isAIChat ? 'bg-amber-ai/15 text-amber-ai' : 'bg-surface-secondary text-foreground',
              )}
            >
              {isAIChat ? <Sparkles className="size-4" /> : getInitials(chat.name)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold">{chat.name}</h2>
              {supportsDirectE2E && e2eInitialized && (
                <EncryptionStatusBadge
                  status={e2eVerified ? 'verified' : e2eError ? 'error' : 'encrypted'}
                  onClick={e2eRecipientId ? () => setShowSafetyVerification(true) : undefined}
                />
              )}
              {isEncrypted && encryptionType && (!supportsDirectE2E || !e2eInitialized) && (
                <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
                  {encryptionType === 'p2p' ? (
                    <>
                      <Shield className="size-3" />
                      {t('chat.p2p')}
                    </>
                  ) : (
                    <>
                      <Lock className="size-3" />
                      {t('chat.encrypted')}
                    </>
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {isGroup && chat.members && (
                <span className="text-xs text-muted-foreground">
                  {chat.members.length} {t('chat.members')}
                </span>
              )}
              {!isGroup && !isAIChat && chat.online && (
                <span className="text-xs text-emerald-brand">{t('chat.online')}</span>
              )}
              {!isGroup && !isAIChat && !chat.online && (
                <span className="text-xs text-muted-foreground">
                  {canShowLastSeen ? t('chat.lastSeen') : t('profile.hidden')}
                </span>
              )}
              {isAIChat && (
                <span className="flex items-center gap-1 text-xs text-amber-ai">
                  <span className="size-1.5 rounded-full bg-amber-ai" />
                  {t('chat.aiAssistant')}
                </span>
              )}
              {isIncognitoMode && (
                <span className="flex items-center gap-1 text-xs text-primary">
                  <Ghost className="size-3" />
                  {t('chat.incognitoOn')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-9', chat.wallpaper ? 'text-primary' : 'text-muted-foreground')}
            aria-label={t('aria.changeWallpaper')}
            onClick={() => setShowWallpaperPicker(true)}
          >
            <Palette className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-9', isIncognitoMode ? 'text-primary' : 'text-muted-foreground')}
            aria-label={t('aria.toggleIncognito')}
            onClick={() => updateSettings({ incognitoMode: !isIncognitoMode })}
          >
            <Ghost className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'size-9 transition-colors',
              showOpenClawActions ? 'text-emerald-500 hover:text-emerald-500' : 'text-muted-foreground hover:text-foreground',
            )}
            aria-label={t('aria.openclaw')}
            onClick={() => setShowOpenClawActions((v) => !v)}
          >
            <Zap className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-9', showInChatSearch ? 'text-primary' : 'text-muted-foreground')}
            aria-label="Search in chat"
            onClick={() => setShowInChatSearch((prev) => !prev)}
          >
            <Search className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn('size-9', showMediaGallery ? 'text-primary' : 'text-muted-foreground')}
            aria-label="Open media gallery"
            onClick={() => setShowMediaGallery(true)}
          >
            <ImageIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={t('aria.voiceCall')}
            onClick={() => setShowCallScreen('audio')}
          >
            <Phone className="size-4.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={t('aria.videoCall')}
            onClick={() => setShowCallScreen('video')}
          >
            <Video className="size-4.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={t('aria.moreOptions')}
            onClick={() => setContextMenuOpen(true)}
          >
            <MoreVertical className="size-4.5" />
          </Button>
        </div>
      </header>

      {selectionMode && (
        <div className="border-b bg-muted/20 px-3 py-2">
          <div className="mx-auto flex items-center justify-between gap-2 lg:max-w-3xl">
            <div className="inline-flex items-center gap-2 text-sm">
              <CheckSquare className="size-4 text-primary" />
              <span>{tf('msg.selectedCount', { count: selectedMessageIds.length })}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="size-8" onClick={handleCopySelected} aria-label={t('msg.copy')}>
                <Copy className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="size-8" onClick={handleDeleteSelected} aria-label={t('msg.delete')}>
                <Trash2 className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="size-8" onClick={clearSelectionMode} aria-label={t('common.cancel')}>
                <Square className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {relayStatusText && (
        <div
          className={cn(
            'border-b px-3 py-1.5 text-xs',
            relayStatusTone === 'warn'
              ? 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300',
          )}
        >
          <div className="mx-auto flex items-center gap-2 lg:max-w-3xl">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>{relayStatusText}</span>
          </div>
        </div>
      )}

      {queueReplayText && (
        <div className="border-b border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">
          <div className="mx-auto flex items-center gap-2 lg:max-w-3xl">
            <Zap className="size-3.5 shrink-0" />
            <span>{queueReplayText}</span>
          </div>
        </div>
      )}

      {showInChatSearch && (
        <div className="border-b bg-muted/20 px-3 py-2">
          <div className="mx-auto space-y-2 lg:max-w-3xl">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search text..."
                className="h-9"
              />
              <select
                value={searchSenderId}
                onChange={(e) => setSearchSenderId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All senders</option>
                {inChatSearchSenders.map((sender) => (
                  <option key={sender.id} value={sender.id}>
                    {sender.name}
                  </option>
                ))}
              </select>
              <select
                value={searchMessageType}
                onChange={(e) => setSearchMessageType(e.target.value as typeof searchMessageType)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All types</option>
                <option value="text">Text</option>
                <option value="media">Media</option>
                <option value="voice">Voice</option>
                <option value="video-circle">Video</option>
                <option value="file">File</option>
                <option value="link">Link</option>
              </select>
              <Input
                type="date"
                value={searchDateFrom}
                onChange={(e) => setSearchDateFrom(e.target.value)}
                className="h-9"
              />
              <Input
                type="date"
                value={searchDateTo}
                onChange={(e) => setSearchDateTo(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {filteredSearchResults.length === 0
                  ? 'No results'
                  : `${activeSearchResultIndex + 1} / ${filteredSearchResults.length}`}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => jumpToSearchResult(activeSearchResultIndex - 1)}
                  disabled={filteredSearchResults.length === 0}
                  aria-label="Previous search result"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => jumpToSearchResult(activeSearchResultIndex + 1)}
                  disabled={filteredSearchResults.length === 0}
                  aria-label="Next search result"
                >
                  <ChevronRight className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchSenderId('');
                    setSearchMessageType('');
                    setSearchDateFrom('');
                    setSearchDateTo('');
                    setActiveSearchResultIndex(0);
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentPinnedMessage && (
        <div className="border-b bg-muted/30 px-3 py-2">
          <div className="mx-auto flex items-center gap-2 lg:max-w-3xl">
            <Pin className="size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-foreground">{t('chat.pinnedTitle')}</p>
              <p className="truncate text-xs text-muted-foreground">
                {currentPinnedMessage.content || currentPinnedMessage.mediaName || t('common.message')}
              </p>
            </div>
            {pinnedMessages.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => setPinnedIndex((idx) => (idx - 1 + pinnedMessages.length) % pinnedMessages.length)}
                  aria-label={t('aria.previousPinnedMessage')}
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <span className="text-[10px] text-muted-foreground">{tf('chat.pinnedCount', { count: pinnedMessages.length })}</span>
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => setPinnedIndex((idx) => (idx + 1) % pinnedMessages.length)}
                  aria-label={t('aria.nextPinnedMessage')}
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ScrollArea className="presidium-scroll flex-1" ref={scrollRef} style={wallpaperStyle}>
        <div className="mx-auto flex flex-col gap-1 px-4 py-3 lg:max-w-3xl">
          {/* E2E Initialization Banner */}
          {activeChatId && supportsDirectE2E && !e2eInitialized && (
            <E2EInitializationBanner />
          )}

          {/* E2E Error Banner */}
          {activeChatId && supportsDirectE2E && e2eError && (
            <E2EErrorBanner
              onRetry={async () => {
                setE2eError(null);
                try {
                  await reconnectE2E();
                } catch {
                  setE2eError(t('chat.e2eReinitFailed'));
                }
              }}
            />
          )}

          {/* E2E Encryption Notice */}
          {activeChatId && supportsDirectE2E && e2eInitialized && !e2eError && chatMessages.length === 0 && (
            <EncryptionNotice
              recipientName={chat?.name || ''}
              isVerified={e2eVerified}
              onVerify={() => setShowSafetyVerification(true)}
            />
          )}

          {chatMessages.map((msg, idx) => {
            const info = groupInfo[msg.id] || { showAvatar: false, isLastInGroup: true };
            const currentStamp = toDateStamp(msg.createdAt);
            const prevStamp = idx > 0 ? toDateStamp(chatMessages[idx - 1]?.createdAt) : '';
            const showDateSeparator = idx === 0 || currentStamp !== prevStamp;
            return (
              <div
                key={msg.id}
                ref={(node) => {
                  messageRefs.current[msg.id] = node;
                }}
                className={cn(
                  'space-y-1 rounded-lg transition-colors',
                  activeSearchMessageId === msg.id && 'bg-primary/5 ring-1 ring-primary/40',
                )}
              >
                {showDateSeparator && (
                  <div className="my-2 flex justify-center">
                    <span className="rounded-full bg-muted/70 px-3 py-1 text-[10px] font-medium text-muted-foreground">
                      {toHumanDay(msg.createdAt, locale)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={msg}
                  showAvatar={info.showAvatar}
                  isLastInGroup={info.isLastInGroup}
                  showStatusLabel={showOutgoingStatusLabel}
                  queueState={msg.isMe ? outboxMessageIndicators[msg.id] : undefined}
                  onReply={handleReplyMessage}
                  onSwipeReply={handleReplyMessage}
                  onEdit={msg.isMe && msg.type === 'text' ? handleEditMessage : undefined}
                  onCopy={handleCopyMessage}
                  onForward={handleForwardMessage}
                  onPin={handlePinMessage}
                  onDelete={handleDeleteMessage}
                  onToggleSelect={toggleSelection}
                  onViewHistory={setViewHistoryTarget}
                  onQuoteSegment={handleQuoteSegment}
                  selected={selectedMessageIds.includes(msg.id)}
                  selectionMode={selectionMode}
                  showReadBy={isGroup}
                  contentProtection={Boolean(settings.contentProtection)}
                  resolveUserName={(id) => contacts.find((contact) => contact.id === id)?.name || id}
                />
              </div>
            );
          })}

          {(aiTyping || openClawTyping || peerTypingCount > 0) && (
            <div className="mt-2 flex items-center gap-2 px-2">
              <Avatar className="size-6">
                <AvatarFallback
                  className={cn(
                    'text-[9px]',
                    aiTyping
                      ? 'bg-amber-ai/15 text-amber-ai'
                      : openClawTyping
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'bg-blue-500/15 text-blue-500',
                  )}
                >
                  {aiTyping ? <Sparkles className="size-3" /> : openClawTyping ? <Zap className="size-3" /> : <span>...</span>}
                </AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-2xl px-4 py-3',
                  aiTyping
                    ? 'border border-amber-ai/20 bg-amber-ai/5'
                    : openClawTyping
                      ? 'border border-emerald-500/20 bg-emerald-500/5'
                      : 'border border-blue-500/20 bg-blue-500/5',
                )}
              >
                {(aiTyping || openClawTyping) && (
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  >
                    {aiTyping ? (
                      <Sparkles className="size-3.5 text-amber-ai" />
                    ) : (
                      <Zap className="size-3.5 text-emerald-500" />
                    )}
                  </motion.span>
                )}
                <span
                  className={cn(
                    'text-xs font-medium',
                    aiTyping
                      ? 'text-amber-ai'
                      : openClawTyping
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-blue-600 dark:text-blue-400',
                  )}
                >
                  {aiTyping
                    ? t('chat.aiTyping')
                    : openClawTyping
                      ? t('openclaw.analyzing')
                      : typingLabel || t('chat.typingGeneric')}
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <AnimatePresence>
        {showAIActions && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t bg-background"
          >
            <div className="flex items-center gap-2 px-4 py-2.5">
              <Sparkles className="size-4 shrink-0 text-amber-ai" />
              <div className="flex flex-1 gap-2 overflow-x-auto">
                {AI_SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-ai/20 bg-amber-ai/5 px-3 py-1.5 text-xs font-medium text-amber-ai transition-colors hover:bg-amber-ai/15"
                  >
                    <Sparkles className="size-3" />
                    {chip}
                  </button>
                ))}
              </div>
              <button
                onClick={toggleAIActions}
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t('aria.closeAiSuggestions')}
                type="button"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showOpenClawActions && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t bg-background"
          >
            <div className="flex items-center gap-2 px-4 py-2.5">
              <Zap className="size-4 shrink-0 text-emerald-500" />
              <div className="flex flex-1 gap-2 overflow-x-auto">
                {OPENCLAW_SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip.mode}
                    type="button"
                    onClick={() => handleOpenClawMention(chip.label, chip.mode)}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/15 dark:text-emerald-400"
                  >
                    <Zap className="size-3" />
                    {chip.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowOpenClawActions(false)}
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t('aria.closeOpenclawSuggestions')}
                type="button"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MessageInput
        key={editingMessage ? `edit-${editingMessage.id}` : 'compose'}
        chatId={activeChatId || undefined}
        onSend={handleSend}
        onToggleAI={toggleAIActions}
        showAI={showAIActions}
        onAIMention={handleAIMention}
        onOpenClawMention={handleOpenClawMention}
        onSendFile={handleSendFile}
        onSendGif={handleSendGif}
        onSendSticker={handleSendSticker}
        onTypingChange={handleTypingChange}
        draftStorageKey={activeChatId ? `presidium:draft:${activeChatId}` : undefined}
        disableDraftPersistence={isIncognitoMode}
        silentMode={silentMode}
        onToggleSilentMode={() => setSilentMode((v) => !v)}
        initialText={editingMessage?.content || ''}
        editMessage={
          editingMessage
            ? {
                id: editingMessage.id,
                content: editingMessage.content,
              }
            : null
        }
        onCancelEdit={() => setEditingMessage(null)}
        replyTo={
          replyToMessage
            ? {
                id: replyToMessage.id,
                senderName: replyToMessage.senderName,
                content: replyToMessage.content,
                type: replyToMessage.type,
              }
            : null
        }
        onCancelReply={() => setReplyToMessage(null)}
      />

      <Dialog open={showMediaGallery} onOpenChange={setShowMediaGallery}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Media Gallery</DialogTitle>
            <DialogDescription>
              Files, photos, videos and voice messages from this chat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'image', 'video', 'file', 'audio'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setMediaGalleryType(type)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    mediaGalleryType === type
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
            <ScrollArea className="h-[50vh] rounded-md border">
              {mediaGalleryLoading ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  Loading media...
                </div>
              ) : mediaGalleryItems.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  No media found
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-3">
                  {mediaGalleryItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="overflow-hidden rounded-lg border text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
                      onClick={() => {
                        const node = messageRefs.current[item.messageId];
                        if (node) {
                          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                        setShowMediaGallery(false);
                      }}
                    >
                      <div className="aspect-square bg-muted/40">
                        {item.type === 'image' && item.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.url} alt={item.name || 'image'} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                            {item.type.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="space-y-0.5 px-2 py-1.5">
                        <p className="truncate text-xs font-medium">{item.name || item.type}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{item.senderName}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(forwardMessage)}
        onOpenChange={(open) => {
          if (!open) {
            setForwardMessage(null);
            setForwardWithoutSender(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('msg.forwardDialogTitle')}</DialogTitle>
            <DialogDescription>{t('msg.forwardDialogDesc')}</DialogDescription>
          </DialogHeader>

          <label className="mb-1 flex cursor-pointer items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t('msg.forwardWithoutSender')}</span>
            <button
              type="button"
              onClick={() => setForwardWithoutSender((v) => !v)}
              className={cn(
                'inline-flex h-6 w-11 items-center rounded-full transition-colors',
                forwardWithoutSender ? 'bg-primary' : 'bg-muted',
              )}
              aria-label={t('msg.forwardWithoutSender')}
            >
              <span
                className={cn(
                  'mx-0.5 inline-block size-5 rounded-full bg-background transition-transform',
                  forwardWithoutSender ? 'translate-x-5' : 'translate-x-0',
                )}
              />
            </button>
          </label>

          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {forwardTargetChats.length === 0 && (
              <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {t('msg.forwardNoChats')}
              </p>
            )}

            {forwardTargetChats.map((target) => (
              <button
                key={target.id}
                type="button"
                onClick={() => handleForwardToChat(target.id)}
                className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-accent"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs font-semibold">{getInitials(target.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{target.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{target.lastMessage || ' '}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setForwardMessage(null)}>
              {t('msg.forwardCancel')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTargetMessage)} onOpenChange={(open) => !open && setDeleteTargetMessage(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('msg.deleteDialogTitle')}</DialogTitle>
            <DialogDescription>{t('msg.deleteDialogDesc')}</DialogDescription>
          </DialogHeader>

          {deleteTargetMessage && (
            <div className="rounded-lg border bg-muted/40 px-3 py-2">
              <p className="truncate text-xs text-muted-foreground">{deleteTargetMessage.senderName}</p>
              <p className="truncate text-sm">{deleteTargetMessage.content || t('common.message')}</p>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => handleDeleteScope('me')}>
              {t('msg.deleteForMe')}
            </Button>
            {deleteTargetMessage?.isMe && (
              <Button variant="destructive" onClick={() => handleDeleteScope('everyone')}>
                {t('msg.deleteForEveryone')}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showWallpaperPicker} onOpenChange={setShowWallpaperPicker}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('chat.wallpaperTitle')}</DialogTitle>
            <DialogDescription>{t('chat.wallpaperDesc')}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {WALLPAPER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={cn(
                  'overflow-hidden rounded-xl border text-left transition-colors hover:border-primary/50',
                  chat.wallpaper === preset.value ? 'border-primary' : 'border-border/60',
                )}
                onClick={() => {
                  setChatWallpaper(chat.id, preset.value);
                  setShowWallpaperPicker(false);
                }}
              >
                <div className="h-14 w-full bg-background" style={preset.value ? { backgroundImage: preset.value, backgroundSize: '18px 18px' } : undefined} />
                <div className="px-2 py-1.5 text-xs">{preset.label}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewHistoryTarget)} onOpenChange={(open) => !open && setViewHistoryTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('msg.editHistory')}</DialogTitle>
            <DialogDescription>{t('msg.editHistoryDesc')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {(viewHistoryTarget?.editHistory || []).length === 0 && (
              <p className="text-sm text-muted-foreground">{t('msg.editHistoryEmpty')}</p>
            )}
            {(viewHistoryTarget?.editHistory || []).map((entry, index) => (
              <div key={`${entry.editedAt}-${index}`} className="rounded-lg border bg-muted/30 p-2.5">
                <p className="text-[10px] text-muted-foreground">
                  {new Date(entry.editedAt).toLocaleString()}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{entry.content}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {moderationDialog.open && moderationDialog.result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={handleModerationDiscard}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="mx-4 w-full max-w-md rounded-2xl border bg-background p-5 shadow-xl"
            >
              <div className="mb-4 flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-ai/15">
                  <AlertTriangle className="size-5 text-amber-ai" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground">{t('moderation.messageFlagged')}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('moderation.warning')}</p>
                </div>
                <button
                  onClick={handleModerationDiscard}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                  type="button"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="mb-4 max-h-48 space-y-2 overflow-y-auto rounded-lg bg-muted/50 p-3">
                {moderationDialog.flags.map((flag, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <Shield className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">{flag.category.replace(/_/g, ' ')}</span>
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                            flag.severity === 'high' && 'bg-red-500/15 text-red-600 dark:text-red-400',
                            flag.severity === 'medium' && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                            flag.severity === 'low' && 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
                          )}
                        >
                          {flag.severity}
                        </span>
                      </div>
                      <p className="mt-0.5 text-muted-foreground">{flag.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {moderationDialog.suggestion && (
                <div className="mb-4 rounded-lg border border-amber-ai/20 bg-amber-ai/5 p-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-ai">
                    <Sparkles className="size-3" />
                    {t('moderation.suggestion')}
                  </div>
                  <p className="text-xs leading-relaxed text-foreground/80">{moderationDialog.suggestion}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleModerationDiscard}
                  className="flex flex-1 items-center justify-center rounded-xl bg-muted px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80"
                  type="button"
                >
                  {t('moderation.discardMessage')}
                </button>
                {moderationDialog.suggestion && (
                  <button
                    onClick={handleModerationUseSuggestion}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-ai px-3 py-2.5 text-xs font-medium text-amber-ai-foreground transition-colors hover:bg-amber-ai/90"
                    type="button"
                  >
                    <Sparkles className="size-3.5" />
                    {t('moderation.useSuggestion')}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ChatContextMenu chatId={chat.id} isOpen={contextMenuOpen} onClose={() => setContextMenuOpen(false)} />

      <AnimatePresence>
        {showCallScreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50"
          >
            <CallScreen callType={showCallScreen} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* E2E Safety Number Verification Dialog */}
      {activeChatId && chat && e2eRecipientId && (
        <SafetyNumberVerification
          contactId={e2eRecipientId}
          contactName={chat.name}
          isOpen={showSafetyVerification}
          onClose={() => setShowSafetyVerification(false)}
          onVerified={() => {
            setE2eVerified(true);
            toast.success(t('chat.contactVerified'));
          }}
        />
      )}
    </div>
  );
}
