'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuthSync } from '@/hooks/use-auth-sync';
import useWebSocket from '@/hooks/use-websocket';
import { useAppStore } from '@/store/use-app-store';
import { useApiStore } from '@/store/use-api-store';
import type { AppView, Message } from '@/types';
import { enqueueOutboxTask, flushOutbox } from '@/lib/message-outbox';
import type { OutboxTask, OutboxFlushDecision } from '@/lib/message-outbox';
import {
  RELAY_QUEUE_DELIVERED_EVENT,
  parseRelayQueueDeliveredPayload,
} from '@/lib/realtime-events';
import {
  parseEnvelopeContent,
  resolveAckStatusUpdate,
  resolveFallbackGroupOrChannelId,
  resolveReadReceiptUpdate,
} from '@/lib/realtime-inbound';

import { WelcomeScreen } from '@/components/messenger/onboarding/welcome-screen';
import { RegistrationScreen } from '@/components/messenger/onboarding/registration-screen';
import { VerificationScreen } from '@/components/messenger/onboarding/verification-screen';
import { PinSetupScreen } from '@/components/messenger/onboarding/pin-setup-screen';
import { PermissionsScreen } from '@/components/messenger/onboarding/permissions-screen';

import { ChatList } from '@/components/messenger/chat-list/chat-list';
import { ArchiveView } from '@/components/messenger/chat-list/archive-view';
import { ChatView } from '@/components/messenger/chat-view/chat-view';
import { BottomNav } from '@/components/messenger/shared/bottom-nav';
import { DesktopSidebar } from '@/components/messenger/shared/desktop-sidebar';
import { DesktopWelcome } from '@/components/messenger/shared/desktop-welcome';

import FeedScreen from '@/components/messenger/feed/feed-screen';
import CreatePostScreen from '@/components/messenger/feed/create-post';
import MarketplaceScreen from '@/components/messenger/feed/marketplace';
import LibraryScreen from '@/components/messenger/feed/library-screen';
import BookReader from '@/components/messenger/feed/book-reader';

import AICenterScreen from '@/components/messenger/ai-center/ai-center';
import ProfileScreen from '@/components/messenger/profile/profile-screen';
import EditProfileScreen from '@/components/messenger/profile/edit-profile';
import SettingsScreen from '@/components/messenger/profile/settings-screen';
import NotificationsScreen from '@/components/messenger/profile/notifications-settings';
import StorageScreen from '@/components/messenger/profile/storage-manager';
import FavoritesScreen from '@/components/messenger/profile/favorites-screen';
import ContactsScreen from '@/components/messenger/profile/contacts-list';
import CallsScreen from '@/components/messenger/profile/calls-history';
import TwoFactorScreen from '@/components/messenger/profile/two-factor-auth';
import PersonalDataScreen from '@/components/messenger/profile/personal-data';
import CreateChannelScreen from '@/components/messenger/profile/create-channel';
import ContactProfileCard from '@/components/messenger/chat-view/contact-profile-card';

import GroupCreation from '@/components/messenger/group-creation/group-creation';
import GlobalSearch from '@/components/messenger/chat-list/global-search';
import NewContact from '@/components/messenger/chat-list/new-contact';
import CallScreen from '@/components/messenger/chat-view/call-screen';
import { handleNotificationAction, registerPushService, type PushNotificationPayload } from '@/lib/push-notifications';

interface PreferencesResponse {
  locale?: 'en' | 'ru';
  accentColor?: string;
  settings?: Record<string, unknown>;
}

function normalizeMessageType(rawType: unknown): Message['type'] {
  if (
    rawType === 'text' ||
    rawType === 'system' ||
    rawType === 'ai' ||
    rawType === 'openclaw' ||
    rawType === 'voice' ||
    rawType === 'video-circle' ||
    rawType === 'media'
  ) {
    return rawType;
  }

  if (rawType === 'image' || rawType === 'file' || rawType === 'video') {
    return 'media';
  }

  return 'text';
}

function toUiTime(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isMessageStatus(value: unknown): value is Message['status'] {
  return value === 'sending' || value === 'sent' || value === 'delivered' || value === 'read';
}

function renderOnboarding(step: ReturnType<typeof useAppStore.getState>['onboardingStep']) {
  switch (step) {
    case 'registration':
      return <RegistrationScreen />;
    case 'verification':
      return <VerificationScreen />;
    case 'pin':
      return <PinSetupScreen />;
    case 'permissions':
      return <PermissionsScreen />;
    case 'welcome':
    default:
      return <WelcomeScreen />;
  }
}

function renderView(currentView: AppView) {
  switch (currentView) {
    case 'chats':
      return <ChatList />;
    case 'archive':
      return <ArchiveView />;
    case 'chat':
      return <ChatView />;
    case 'feed':
      return <FeedScreen />;
    case 'ai-center':
      return <AICenterScreen />;
    case 'profile':
      return <ProfileScreen />;
    case 'group-creation':
      return <GroupCreation />;
    case 'global-search':
      return <GlobalSearch />;
    case 'new-contact':
      return <NewContact />;
    case 'contact-profile':
      return <ContactProfileCard />;
    case 'edit-profile':
      return <EditProfileScreen />;
    case 'create-channel':
      return <CreateChannelScreen />;
    case 'notifications':
      return <NotificationsScreen />;
    case 'storage':
      return <StorageScreen />;
    case 'favorites':
      return <FavoritesScreen />;
    case 'contacts':
      return <ContactsScreen />;
    case 'calls':
      return <CallsScreen />;
    case 'two-factor':
      return <TwoFactorScreen />;
    case 'personal-data':
      return <PersonalDataScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'create-post':
      return <CreatePostScreen />;
    case 'marketplace':
      return <MarketplaceScreen />;
    case 'library':
      return <LibraryScreen />;
    case 'library-reader':
      return <BookReader />;
    case 'call-screen':
      return <CallScreen />;
    case 'chat-settings':
      return <ChatView />;
    case 'onboarding':
    default:
      return <WelcomeScreen />;
  }
}

export default function Home() {
  const isMobile = useIsMobile();
  const { status } = useAuthSync();

  const currentView = useAppStore((s) => s.currentView);
  const onboardingStep = useAppStore((s) => s.onboardingStep);
  const activeChatId = useAppStore((s) => s.activeChatId);
  const chats = useAppStore((s) => s.chats);
  const setActiveChat = useAppStore((s) => s.setActiveChat);
  const user = useAppStore((s) => s.user);
  const settings = useAppStore((s) => s.settings);
  const locale = useAppStore((s) => s.locale);
  const accentColor = useAppStore((s) => s.accentColor);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const setWebSocketBridge = useAppStore((s) => s.setWebSocketBridge);
  const clearWebSocketBridge = useAppStore((s) => s.clearWebSocketBridge);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const lastPreferencesHashRef = useRef<string>('');

  const syncChats = useApiStore((s) => s.syncChats);
  const syncContacts = useApiStore((s) => s.syncContacts);

  const persistMessageStatus = useCallback(
    async (chatId: string, messageId: string, status: Message['status']) => {
      const path = `/api/messages/${messageId}`;
      try {
        const res = await fetch(path, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });

        if (res.ok) return;

        if (res.status === 401 || res.status === 403) {
          enqueueOutboxTask({
            kind: 'api_request',
            chatId,
            messageId,
            payload: {
              method: 'PATCH',
              path,
              body: { status },
            },
          });
          return;
        }

        if (res.status === 429 || res.status >= 500) {
          enqueueOutboxTask({
            kind: 'api_request',
            chatId,
            messageId,
            payload: {
              method: 'PATCH',
              path,
              body: { status },
            },
          });
        }
      } catch {
        enqueueOutboxTask({
          kind: 'api_request',
          chatId,
          messageId,
          payload: {
            method: 'PATCH',
            path,
            body: { status },
          },
        });
      }
    },
    [],
  );

  const handleWsMessage = useCallback((message: { type: string; payload?: unknown }) => {
    const store = useAppStore.getState();

    if (message.type === 'relay.ack' || message.type === 'relay.group_ack' || message.type === 'relay.channel_ack') {
      const ack = resolveAckStatusUpdate(message.payload);
      if (ack) {
        store.setMessageStatus(ack.chatId, ack.messageId, ack.nextStatus);
        if (ack.shouldPersist) {
          void persistMessageStatus(ack.chatId, ack.messageId, ack.nextStatus);
        }
      }
      return;
    }

    if (message.type === 'relay.queue.delivered') {
      const detail = parseRelayQueueDeliveredPayload(message.payload);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(RELAY_QUEUE_DELIVERED_EVENT, {
            detail,
          }),
        );
      }

      // Deferred offline envelopes were flushed to this client.
      // Pull latest chat state so unread/last-message indicators stay consistent.
      if (detail.delivered > 0) {
        void syncChats();
      }
      return;
    }

    if (message.type === 'typing.start' || message.type === 'typing.stop') {
      const payload = message.payload as Record<string, unknown> | undefined;
      const from = typeof payload?.from === 'string' ? payload.from : '';
      if (!from) return;

      const chat = store.chats.find((entry) => entry.members?.includes(from));
      if (!chat) return;
      store.setChatTypingUser(chat.id, from, message.type === 'typing.start');
      return;
    }

    if (
      message.type !== 'relay.envelope' &&
      message.type !== 'relay.group_envelope' &&
      message.type !== 'relay.channel_envelope'
    ) {
      return;
    }

    const payload = message.payload as Record<string, unknown> | undefined;
    const from = typeof payload?.from === 'string' ? payload.from : '';
    const rawContent = typeof payload?.content === 'string' ? payload.content : '';
    if (!from || !rawContent) return;

    const parsed = parseEnvelopeContent(rawContent);
    const fallbackGroupOrChannelId = resolveFallbackGroupOrChannelId(payload);

    const readReceipt = resolveReadReceiptUpdate({
      parsed,
      fallbackChatId: fallbackGroupOrChannelId,
      fromUserId: from,
      chats: store.chats,
    });

    if (readReceipt) {
      for (const messageId of readReceipt.messageIds) {
        store.setMessageStatus(readReceipt.chatId, messageId, 'read');
        store.addMessageReader(readReceipt.chatId, messageId, readReceipt.readByUserId);
        void persistMessageStatus(readReceipt.chatId, messageId, 'read');
      }
      return;
    }

    const resolvedChat =
      (typeof parsed.chatId === 'string' && store.chats.find((entry) => entry.id === parsed.chatId)) ||
      (fallbackGroupOrChannelId && store.chats.find((entry) => entry.id === fallbackGroupOrChannelId)) ||
      store.chats.find((entry) => entry.members?.includes(from));
    if (!resolvedChat) return;

    const eventType = typeof parsed.event === 'string' ? parsed.event : '';
    if (eventType === 'edit') {
      const messageId = typeof parsed.id === 'string' ? parsed.id : '';
      const nextContent = typeof parsed.content === 'string' ? parsed.content : '';
      if (messageId && nextContent) {
        store.editMessageContent(resolvedChat.id, messageId, nextContent);
      }
      return;
    }

    if (eventType === 'delete') {
      const messageId = typeof parsed.id === 'string' ? parsed.id : '';
      if (messageId) {
        store.tombstoneMessage(resolvedChat.id, messageId, {
          deletedBy: from,
          deletedForEveryone: true,
        });
      }
      return;
    }

    const incomingId = typeof parsed.id === 'string' ? parsed.id : crypto.randomUUID();
    const existing = (store.messages[resolvedChat.id] || []).some((entry) => entry.id === incomingId);
    if (existing) {
      return;
    }

    const incomingMessage: Message = {
      id: incomingId,
      chatId: resolvedChat.id,
      senderId: typeof parsed.senderId === 'string' ? parsed.senderId : from,
      senderName:
        typeof parsed.senderName === 'string'
          ? parsed.senderName
          : resolvedChat.name || 'Unknown',
      senderAvatar: typeof parsed.senderAvatar === 'string' ? parsed.senderAvatar : '',
      content:
        typeof parsed.content === 'string'
          ? parsed.content
          : rawContent,
      timestamp: toUiTime(parsed.timestamp ?? payload?.timestamp),
      type: normalizeMessageType(parsed.type),
      status: 'delivered',
      isMe: false,
      createdAt:
        typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
      updatedAt:
        typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : typeof parsed.createdAt === 'string'
            ? parsed.createdAt
            : new Date().toISOString(),
      silent: typeof parsed.silent === 'boolean' ? parsed.silent : false,
      readBy: [],
      mediaUrl: typeof parsed.mediaUrl === 'string' ? parsed.mediaUrl : undefined,
      mediaType:
        parsed.mediaType === 'image' || parsed.mediaType === 'file' || parsed.mediaType === 'audio'
          ? parsed.mediaType
          : undefined,
      mediaName: typeof parsed.mediaName === 'string' ? parsed.mediaName : undefined,
      mediaSize: typeof parsed.mediaSize === 'number' ? parsed.mediaSize : undefined,
      mediaMimeType: typeof parsed.mediaMimeType === 'string' ? parsed.mediaMimeType : undefined,
    };

    store.receiveMessage(resolvedChat.id, incomingMessage);
  }, [persistMessageStatus, syncChats]);

  const {
    isConnected,
    sendMessageToChat,
    sendTyping,
    sendReadReceipt,
    joinChat,
    leaveChat,
  } = useWebSocket({
    enabled: isAuthenticated && status === 'authenticated',
    onMessage: handleWsMessage,
  });

  const processOutboxTask = useCallback(
    async (task: OutboxTask): Promise<OutboxFlushDecision> => {
      if (task.kind === 'ws_broadcast') {
        if (!isConnected) return 'defer';
        const sent = sendMessageToChat(task.chatId, task.payload);
        if (sent) {
          useAppStore.getState().setMessageStatus(task.chatId, task.messageId, 'sent');
        }
        return sent ? 'success' : 'defer';
      }

      const method =
        typeof task.payload.method === 'string' && task.payload.method.trim()
          ? task.payload.method.toUpperCase()
          : task.kind === 'api_persist'
            ? 'POST'
            : 'PATCH';
      const path =
        typeof task.payload.path === 'string' && task.payload.path.trim()
          ? task.payload.path
          : task.kind === 'api_persist'
            ? '/api/messages'
            : `/api/messages/${task.messageId}`;

      const bodySource = task.kind === 'api_persist' ? task.payload : task.payload.body;
      const body =
        bodySource && typeof bodySource === 'object'
          ? JSON.stringify(bodySource)
          : undefined;

      try {
        const res = await fetch(path, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body,
        });

        if (res.ok) {
          if (task.kind === 'api_persist') {
            useAppStore.getState().setMessageStatus(task.chatId, task.messageId, 'sent');
          }

          if (task.kind === 'api_request' && method === 'PATCH') {
            const bodyRecord =
              task.payload.body && typeof task.payload.body === 'object'
                ? (task.payload.body as Record<string, unknown>)
                : null;
            const statusValue = bodyRecord?.status;
            if (isMessageStatus(statusValue)) {
              useAppStore.getState().setMessageStatus(task.chatId, task.messageId, statusValue);
            }
          }

          return 'success';
        }
        if (res.status === 401 || res.status === 403) return 'defer';
        if (res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500) return 'retry';
        return 'drop';
      } catch {
        return 'retry';
      }
    },
    [isConnected, sendMessageToChat],
  );

  useEffect(() => {
    if (!isAuthenticated || status !== 'authenticated') return;

    const flushNow = () => {
      void flushOutbox(processOutboxTask);
    };

    flushNow();
    const interval = setInterval(flushNow, 3000);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', flushNow);
      return () => {
        clearInterval(interval);
        window.removeEventListener('online', flushNow);
      };
    }

    return () => {
      clearInterval(interval);
    };
  }, [isAuthenticated, processOutboxTask, status]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearWebSocketBridge();
      return;
    }

    setWebSocketBridge({
      connected: isConnected,
      sendMessageToChat,
      sendTyping,
      sendReadReceipt,
      joinChat,
      leaveChat,
    });
  }, [
    clearWebSocketBridge,
    isAuthenticated,
    isConnected,
    joinChat,
    leaveChat,
    sendMessageToChat,
    sendReadReceipt,
    sendTyping,
    setWebSocketBridge,
  ]);

  useEffect(() => {
    if (!isAuthenticated || status !== 'authenticated') return;
    void syncChats();
    void syncContacts();
  }, [isAuthenticated, status, syncChats, syncContacts]);

  useEffect(() => {
    if (!isAuthenticated || status !== 'authenticated') return;
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
    if (!vapidPublicKey || vapidPublicKey.length < 40) return;

    const askedKey = 'presidium-push-asked';
    const alreadyAsked = window.localStorage.getItem(askedKey) === '1';
    const permission = Notification.permission;

    if (permission === 'denied') return;
    if (alreadyAsked && permission !== 'granted') return;

    void registerPushService().finally(() => {
      window.localStorage.setItem(askedKey, '1');
    });
  }, [isAuthenticated, status]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const onServiceWorkerMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; action?: string; data?: Record<string, unknown> }
        | undefined;
      if (!data || data.type !== 'PUSH_NOTIFICATION_ACTION' || !data.action || !data.data) return;

      const payload: PushNotificationPayload = {
        type: 'system',
        title: 'Notification',
        body: '',
        data: data.data,
      };

      handleNotificationAction(data.action, payload);
    };

    navigator.serviceWorker.addEventListener('message', onServiceWorkerMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onServiceWorkerMessage);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || status !== 'authenticated' || !user?.id) {
      setPreferencesHydrated(false);
      return;
    }

    let cancelled = false;
    const loadPreferences = async () => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(user.id)}/preferences`);
        if (!res.ok) {
          if (!cancelled) setPreferencesHydrated(true);
          return;
        }

        const data = (await res.json()) as PreferencesResponse;
        if (cancelled) return;

        useAppStore.setState((state) => ({
          locale: data.locale === 'ru' ? 'ru' : data.locale === 'en' ? 'en' : state.locale,
          accentColor: typeof data.accentColor === 'string' && data.accentColor.trim().length > 0
            ? data.accentColor
            : state.accentColor,
          settings: {
            ...state.settings,
            ...(data.settings || {}),
            openClawEnabled: true,
          },
        }));

        const latestState = useAppStore.getState();
        const hash = JSON.stringify({
          locale: latestState.locale,
          accentColor: latestState.accentColor,
          settings: {
            ...latestState.settings,
            openClawEnabled: true,
          },
        });
        lastPreferencesHashRef.current = hash;
      } finally {
        if (!cancelled) setPreferencesHydrated(true);
      }
    };

    void loadPreferences();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, status, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || status !== 'authenticated' || !user?.id || !preferencesHydrated) return;

    const payload = {
      locale,
      accentColor,
      settings: {
        ...settings,
        openClawEnabled: true,
      },
    };
    const hash = JSON.stringify(payload);
    if (hash === lastPreferencesHashRef.current) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(user.id)}/preferences`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          lastPreferencesHashRef.current = hash;
        }
      } catch {
        // Keep local state and retry on next changes.
      }
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [accentColor, isAuthenticated, locale, preferencesHydrated, settings, status, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || status !== 'authenticated') return;
    if (typeof window === 'undefined') return;
    const chatIdFromUrl = new URLSearchParams(window.location.search).get('chatId');
    if (!chatIdFromUrl) return;
    if (activeChatId === chatIdFromUrl) return;
    if (!chats.some((chat) => chat.id === chatIdFromUrl)) return;
    setActiveChat(chatIdFromUrl);
  }, [activeChatId, chats, isAuthenticated, setActiveChat, status]);

  if (!isAuthenticated) {
    return (
      <main id="main-content" role="main" aria-label="Main content" className="min-h-svh bg-background">
        {renderOnboarding(onboardingStep)}
      </main>
    );
  }

  if (!isMobile && (currentView === 'chats' || currentView === 'chat')) {
    return (
      <main id="main-content" role="main" aria-label="Main content" className="flex h-svh overflow-hidden bg-background text-foreground">
        <DesktopSidebar />
        <section aria-label="Chat list panel" className="w-[360px] shrink-0 border-r border-border">
          <ChatList />
        </section>
        <section aria-label="Chat area" className="min-w-0 flex-1">
          {activeChatId ? <ChatView /> : <DesktopWelcome />}
        </section>
      </main>
    );
  }

  if (!isMobile) {
    return (
      <main id="main-content" role="main" aria-label="Main content" className="flex h-svh overflow-hidden bg-background text-foreground">
        <DesktopSidebar />
        <section className="min-w-0 flex-1">{renderView(currentView)}</section>
      </main>
    );
  }

  return (
    <main id="main-content" role="main" aria-label="Main content" className="min-h-svh bg-background pb-20 text-foreground">
      {renderView(currentView)}
      <BottomNav />
    </main>
  );
}
