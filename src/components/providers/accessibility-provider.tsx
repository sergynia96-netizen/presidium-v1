'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  announce,
  applyAccessibilitySettings,
  loadAccessibilitySettings,
  removeSkipLinks,
  registerDefaultAppShortcuts,
  saveAccessibilitySettings,
  setShortcutsEnabled,
  setupKeyboardShortcuts,
  type AccessibilitySettings,
} from '@/lib/accessibility';
import { useAppStore } from '@/store/use-app-store';

const UPDATE_EVENT = 'presidium:a11y:update';

function focusSearch(): void {
  if (typeof window === 'undefined') return;
  const state = useAppStore.getState();
  if (state.currentView !== 'global-search') {
    state.setView('global-search');
  }

  window.setTimeout(() => {
    const searchInput = document.querySelector<HTMLInputElement>(
      '[data-global-search-input], [data-chat-search-input]'
    );
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
      return;
    }

    const fallback = document.querySelector<HTMLElement>('[aria-label="Search"], [aria-label="Поиск"]');
    fallback?.focus();
  }, 80);
}

function focusMessageInput(): void {
  if (typeof window === 'undefined') return;
  const state = useAppStore.getState();
  if (state.currentView !== 'chat' && state.activeChatId) {
    state.setView('chat');
  }

  window.setTimeout(() => {
    const messageInput = document.getElementById('message-input') as HTMLTextAreaElement | null;
    messageInput?.focus();
  }, 80);
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Ensure any previously injected skip-links are removed.
    removeSkipLinks();

    const settings = loadAccessibilitySettings();
    applyAccessibilitySettings(settings);

    setShortcutsEnabled(settings.keyboardShortcutsEnabled);
    const stopKeyboardListener = setupKeyboardShortcuts();
    const stopDefaultShortcuts = registerDefaultAppShortcuts({
      focusSearch,
      openNewContact: () => useAppStore.getState().setView('new-contact'),
      goBack: () => useAppStore.getState().goBack(),
      focusMessageInput,
      announceShortcuts: () => {
        announce(
          'Shortcuts: Ctrl K search, Ctrl N new contact, Escape back, Ctrl Enter focus message input.',
          'polite'
        );
      },
    });

    const onA11yUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<Partial<AccessibilitySettings>>;
      const next = {
        ...loadAccessibilitySettings(),
        ...(customEvent.detail || {}),
      };
      saveAccessibilitySettings(next);
      setShortcutsEnabled(next.keyboardShortcutsEnabled);
    };

    window.addEventListener(UPDATE_EVENT, onA11yUpdate);

    return () => {
      window.removeEventListener(UPDATE_EVENT, onA11yUpdate);
      stopDefaultShortcuts();
      stopKeyboardListener();
      removeSkipLinks();
    };
  }, []);

  return <>{children}</>;
}

export function updateAccessibilitySettings(settings: Partial<AccessibilitySettings>): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<Partial<AccessibilitySettings>>(UPDATE_EVENT, {
      detail: settings,
    })
  );
}
