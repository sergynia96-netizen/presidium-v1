'use client';

import { create } from 'zustand';
import { signIn, signOut, getSession } from 'next-auth/react';
import { authApi, chatsApi, messagesApi, contactsApi } from '@/lib/api-client';
import type { User, Chat, Message, Contact } from '@/lib/api-client';
import { useAppStore } from '@/store/use-app-store';
import type { Chat as AppChat, Contact as AppContact } from '@/types';

interface ApiState {
  // Loading states
  isLoading: boolean;
  isSyncing: boolean;
  
  // Error states
  error: string | null;
  authError: string | null;
  
  // Data states
  user: User | null;
  chats: Chat[];
  contacts: Contact[];
  lastSync: Date | null;
  
  // Actions - Auth
  login: (email: string, password: string) => Promise<User | null>;
  register: (email: string, password: string, name: string) => Promise<User | null>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  
  // Actions - Sync
  syncChats: () => Promise<void>;
  syncContacts: () => Promise<void>;
  sendMessage: (chatId: string, content: string) => Promise<Message | null>;
  loadMessages: (chatId: string) => Promise<Message[]>;
  
  // Actions - Utils
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  isLoading: false,
  isSyncing: false,
  error: null,
  authError: null,
  user: null,
  chats: [],
  contacts: [],
  lastSync: null,
};

function toLocalTime(value?: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function mapApiChatToAppChat(chat: Chat, currentUserId?: string): AppChat {
  const members = chat.members || [];
  const otherMembers = currentUserId ? members.filter((member) => member.id !== currentUserId) : members;

  return {
    id: chat.id,
    type: chat.type,
    name: chat.name || 'Untitled chat',
    avatar: chat.avatar || '',
    lastMessage: chat.lastMessage || '',
    lastMessageTime: toLocalTime(chat.lastMessageTime),
    unreadCount: chat.unreadCount ?? 0,
    isPinned: Boolean(chat.isPinned),
    isMuted: Boolean(chat.isMuted),
    isEncrypted: chat.isEncrypted ?? true,
    encryptionType: chat.encryptionType || 'e2e',
    role: (chat.role as AppChat['role']) || 'member',
    online: otherMembers.some((member) => member.status === 'online'),
    members: members.map((member) => member.id),
  };
}

function mapApiContactToAppContact(contact: Contact): AppContact {
  const rawContact = contact.contact as unknown as Record<string, unknown>;
  return {
    id: contact.contactId || contact.id,
    name: contact.customName || contact.contact.displayName || contact.contact.name,
    avatar: contact.contact.avatar || '',
    status: (contact.contact.status as AppContact['status']) || 'offline',
    username: contact.contact.username,
    phone: typeof rawContact.phone === 'string' ? rawContact.phone : undefined,
    bio: typeof rawContact.bio === 'string' ? rawContact.bio : undefined,
    birthday: typeof rawContact.birthday === 'string' ? rawContact.birthday : undefined,
    isFavorite: Boolean(contact.isFavorite),
  };
}

function mapSessionUserToApiUser(
  sessionUser: Record<string, unknown> | null | undefined,
): User | null {
  if (!sessionUser) return null;

  const id = typeof sessionUser.id === 'string' ? sessionUser.id : '';
  const email = typeof sessionUser.email === 'string' ? sessionUser.email : '';
  const name = typeof sessionUser.name === 'string' ? sessionUser.name : '';

  if (!id || !email) return null;

  return {
    id,
    email,
    name,
    avatar: typeof sessionUser.avatar === 'string' ? sessionUser.avatar : undefined,
    status: typeof sessionUser.status === 'string' ? sessionUser.status : undefined,
    username: typeof sessionUser.username === 'string' ? sessionUser.username : undefined,
  };
}

export const useApiStore = create<ApiState>((set, get) => ({
  ...initialState,
  
  // ───────────────────────────────────────────────────────────────────────────
  // Auth Actions
  // ───────────────────────────────────────────────────────────────────────────
  
  login: async (email: string, password: string) => {
    set({ isLoading: true, authError: null });
    
    try {
      const signInResult = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (!signInResult || signInResult.error) {
        throw new Error(signInResult?.error || 'Login failed');
      }

      const session = await getSession();
      const mappedUser = mapSessionUserToApiUser(
        session?.user ? (session.user as unknown as Record<string, unknown>) : null,
      );

      if (mappedUser) {
        set({ user: mappedUser, isLoading: false });
        return mappedUser;
      }

      set({ isLoading: false });
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      set({ authError: message, isLoading: false });
      return null;
    }
  },
  
  register: async (email: string, password: string, name: string) => {
    set({ isLoading: true, authError: null });
    
    try {
      const response = await authApi.register({ email, password, name });
      
      if (response.data?.user) {
        set({ user: response.data.user, isLoading: false });
        return response.data.user;
      }
      
      set({ isLoading: false });
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      set({ authError: message, isLoading: false });
      return null;
    }
  },
  
  logout: async () => {
    try {
      await signOut({ redirect: false });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      set({ user: null, chats: [], contacts: [], lastSync: null });
    }
  },
  
  checkAuth: async () => {
    try {
      const session = await getSession();
      const mappedUser = mapSessionUserToApiUser(
        session?.user ? (session.user as unknown as Record<string, unknown>) : null,
      );

      if (mappedUser) {
        set({ user: mappedUser });
      } else {
        set({ user: null });
      }
    } catch (error) {
      console.error('Auth check error:', error);
      set({ user: null });
    }
  },
  
  // ───────────────────────────────────────────────────────────────────────────
  // Sync Actions
  // ───────────────────────────────────────────────────────────────────────────
  
  syncChats: async () => {
    set({ isSyncing: true, error: null });
    
    try {
      const response = await chatsApi.list();
      
      if (response.chats) {
        const currentUserId = useAppStore.getState().user?.id;
        const mappedChats = response.chats.map((chat) => mapApiChatToAppChat(chat, currentUserId));

        set({ chats: response.chats, lastSync: new Date() });
        useAppStore.setState((state) => ({
          chats: mappedChats,
          activeChatId:
            state.activeChatId && mappedChats.some((chat) => chat.id === state.activeChatId)
              ? state.activeChatId
              : null,
        }));
      }
      
      set({ isSyncing: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync chats';
      set({ error: message, isSyncing: false });
    }
  },
  
  syncContacts: async () => {
    set({ isSyncing: true, error: null });
    
    try {
      const response = await contactsApi.list();
      const contacts =
        (response as { contacts?: Contact[] }).contacts ||
        (response as { data?: { contacts?: Contact[] } }).data?.contacts;
      
      if (contacts) {
        set({ contacts, lastSync: new Date() });
        const mappedContacts = contacts.map(mapApiContactToAppContact);
        useAppStore.setState({ contacts: mappedContacts });
      }
      
      set({ isSyncing: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync contacts';
      set({ error: message, isSyncing: false });
    }
  },
  
  sendMessage: async (chatId: string, content: string) => {
    try {
      const response = await messagesApi.send({
        chatId,
        content,
        type: 'text',
      });
      const message = response.data?.message;
      
      if (message) {
        // Update local state
        const { chats } = get();
        const updatedChats = chats.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                lastMessage: content,
                lastMessageTime: new Date().toISOString(),
              }
            : chat
        );
        
        set({ chats: updatedChats });
        return message;
      }
      
      return null;
    } catch (error) {
      console.error('Send message error:', error);
      return null;
    }
  },
  
  loadMessages: async (chatId: string) => {
    try {
      const response = await messagesApi.list(chatId);
      return response.messages || [];
    } catch (error) {
      console.error('Load messages error:', error);
      return [];
    }
  },
  
  // ───────────────────────────────────────────────────────────────────────────
  // Utils
  // ───────────────────────────────────────────────────────────────────────────
  
  clearError: () => set({ error: null, authError: null }),
  
  reset: () => set(initialState),
}));

// Auto-sync on mount (optional)
if (typeof window !== 'undefined') {
  const apiStore = useApiStore.getState();
  
  // Check auth on load
  apiStore.checkAuth();
}
