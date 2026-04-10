/**
 * Accessibility Module
 *
 * Features:
 * - ARIA attributes throughout the app
 * - Screen reader support
 * - High contrast mode
 * - Large text mode
 * - Keyboard navigation + shortcuts
 * - Reduced motion
 * - Color blindness support
 * - Focus management
 * - Skip links
 *
 * WCAG 2.1 AA compliance target.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AccessibilitySettings {
  highContrast: boolean;
  largeText: boolean;
  reducedMotion: boolean;
  colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
  screenReaderOptimized: boolean;
  keyboardShortcutsEnabled: boolean;
  focusVisible: boolean;
}

export const DEFAULT_ACCESSIBILITY_SETTINGS: AccessibilitySettings = {
  highContrast: false,
  largeText: false,
  reducedMotion: false,
  colorBlindMode: 'none',
  screenReaderOptimized: false,
  keyboardShortcutsEnabled: true,
  focusVisible: true,
};

export const SETTINGS_KEY = 'presidium-a11y-settings';

function canUseDOM(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  description: string;
  category: 'navigation' | 'messaging' | 'media' | 'general';
  handler: () => void;
}

export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  // Navigation
  {
    key: 'k',
    ctrl: true,
    description: 'Открыть поиск',
    category: 'navigation',
    handler: () => {},
  },
  {
    key: 'n',
    ctrl: true,
    description: 'Новый чат',
    category: 'navigation',
    handler: () => {},
  },
  {
    key: 'ArrowUp',
    description: 'Предыдущий чат',
    category: 'navigation',
    handler: () => {},
  },
  {
    key: 'ArrowDown',
    description: 'Следующий чат',
    category: 'navigation',
    handler: () => {},
  },
  {
    key: 'Escape',
    description: 'Закрыть/назад',
    category: 'navigation',
    handler: () => {},
  },
  // Messaging
  {
    key: 'Enter',
    ctrl: true,
    description: 'Отправить сообщение',
    category: 'messaging',
    handler: () => {},
  },
  {
    key: 'ArrowUp',
    ctrl: true,
    description: 'Редактировать последнее сообщение',
    category: 'messaging',
    handler: () => {},
  },
  {
    key: 'r',
    description: 'Ответить на сообщение',
    category: 'messaging',
    handler: () => {},
  },
  {
    key: 'e',
    description: 'Реакция на сообщение',
    category: 'messaging',
    handler: () => {},
  },
  {
    key: 'd',
    description: 'Удалить сообщение',
    category: 'messaging',
    handler: () => {},
  },
  // Media
  {
    key: ' ',
    description: 'Play/Pause голосовое сообщение',
    category: 'media',
    handler: () => {},
  },
  {
    key: 'm',
    description: 'Вкл/выкл микрофон',
    category: 'media',
    handler: () => {},
  },
  // General
  {
    key: '?',
    shift: true,
    description: 'Показать горячие клавиши',
    category: 'general',
    handler: () => {},
  },
  {
    key: '/',
    description: 'Фокус на поиск',
    category: 'general',
    handler: () => {},
  },
];

// ─── Keyboard Shortcut Manager ──────────────────────────────────────────────

const registeredShortcuts = new Map<string, KeyboardShortcut>();
let shortcutsEnabled = true;

/**
 * Register a keyboard shortcut.
 */
export function registerShortcut(shortcut: KeyboardShortcut): () => void {
  const id = getShortcutId(shortcut);
  registeredShortcuts.set(id, shortcut);
  return () => registeredShortcuts.delete(id);
}

/**
 * Unregister all shortcuts.
 */
export function unregisterAllShortcuts(): void {
  registeredShortcuts.clear();
}

/**
 * Enable/disable keyboard shortcuts.
 */
export function setShortcutsEnabled(enabled: boolean): void {
  shortcutsEnabled = enabled;
}

/**
 * Set up global keyboard shortcut listener.
 * Should be called once on app mount.
 */
export function setupKeyboardShortcuts(): () => void {
  if (!canUseDOM()) return () => {};

  const handler = (event: KeyboardEvent) => {
    if (!shortcutsEnabled) return;

    // Don't trigger shortcuts when typing in input/textarea
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // Allow Ctrl+/ to focus search even in inputs
      if (event.key === '/' && event.ctrlKey) {
        event.preventDefault();
        triggerShortcut('ctrl+/');
        return;
      }
      return;
    }

    const id = getShortcutIdFromEvent(event);
    if (registeredShortcuts.has(id)) {
      event.preventDefault();
      triggerShortcut(id);
    }
  };

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}

function triggerShortcut(id: string): void {
  const shortcut = registeredShortcuts.get(id);
  if (shortcut) {
    shortcut.handler();
  }
}

function getShortcutId(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push('ctrl');
  if (shortcut.alt) parts.push('alt');
  if (shortcut.shift) parts.push('shift');
  if (shortcut.meta) parts.push('meta');
  parts.push(shortcut.key.toLowerCase());
  return parts.join('+');
}

function getShortcutIdFromEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  if (event.metaKey) parts.push('meta');
  parts.push(event.key.toLowerCase());
  return parts.join('+');
}

// ─── Color Blindness Support ────────────────────────────────────────────────

/**
 * Apply color blindness filter to the entire app.
 * Uses CSS filters to simulate color blindness corrections.
 */
export function applyColorBlindnessFilter(mode: AccessibilitySettings['colorBlindMode']): void {
  if (!canUseDOM()) return;

  const root = document.documentElement;

  // Remove existing filters
  root.style.filter = '';
  root.removeAttribute('data-color-blind-mode');

  switch (mode) {
    case 'protanopia':
      // Red-blind: enhance greens and blues
      root.style.filter = 'url(#protanopia-filter)';
      root.setAttribute('data-color-blind-mode', 'protanopia');
      break;
    case 'deuteranopia':
      // Green-blind: enhance reds and blues
      root.style.filter = 'url(#deuteranopia-filter)';
      root.setAttribute('data-color-blind-mode', 'deuteranopia');
      break;
    case 'tritanopia':
      // Blue-blind: enhance reds and greens
      root.style.filter = 'url(#tritanopia-filter)';
      root.setAttribute('data-color-blind-mode', 'tritanopia');
      break;
    default:
      root.style.filter = '';
  }
}

/**
 * Generate SVG color blindness filters.
 * Should be injected into the document head.
 */
export function injectColorBlindnessFilters(): void {
  if (!canUseDOM()) return;
  if (document.getElementById('a11y-color-filters')) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'a11y-color-filters';
  svg.style.display = 'none';
  svg.innerHTML = `
    <defs>
      <!-- Protanopia (red-blind) correction -->
      <filter id="protanopia-filter">
        <feColorMatrix type="matrix" values="
          0.567, 0.433, 0.000, 0, 0
          0.558, 0.442, 0.000, 0, 0
          0.000, 0.242, 0.758, 0, 0
          0, 0, 0, 1, 0
        "/>
      </filter>
      <!-- Deuteranopia (green-blind) correction -->
      <filter id="deuteranopia-filter">
        <feColorMatrix type="matrix" values="
          0.625, 0.375, 0.000, 0, 0
          0.700, 0.300, 0.000, 0, 0
          0.000, 0.300, 0.700, 0, 0
          0, 0, 0, 1, 0
        "/>
      </filter>
      <!-- Tritanopia (blue-blind) correction -->
      <filter id="tritanopia-filter">
        <feColorMatrix type="matrix" values="
          0.950, 0.050, 0.000, 0, 0
          0.000, 0.433, 0.567, 0, 0
          0.000, 0.475, 0.525, 0, 0
          0, 0, 0, 1, 0
        "/>
      </filter>
    </defs>
  `;

  document.head.appendChild(svg);
}

// ─── Settings Management ────────────────────────────────────────────────────

/**
 * Load accessibility settings from storage.
 */
export function loadAccessibilitySettings(): AccessibilitySettings {
  if (!canUseDOM()) return { ...DEFAULT_ACCESSIBILITY_SETTINGS };

  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    if (data) {
      return { ...DEFAULT_ACCESSIBILITY_SETTINGS, ...JSON.parse(data) };
    }
  } catch {
    // Use defaults
  }

  // Detect system preferences
  const settings = { ...DEFAULT_ACCESSIBILITY_SETTINGS };

  // Check reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    settings.reducedMotion = true;
  }

  // Check high contrast preference
  if (window.matchMedia('(prefers-contrast: more)').matches) {
    settings.highContrast = true;
  }

  return settings;
}

/**
 * Save accessibility settings.
 */
export function saveAccessibilitySettings(settings: AccessibilitySettings): void {
  if (!canUseDOM()) return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applyAccessibilitySettings(settings);
}

/**
 * Apply accessibility settings to the document.
 */
export function applyAccessibilitySettings(settings: AccessibilitySettings): void {
  if (!canUseDOM()) return;

  const root = document.documentElement;
  const body = document.body;

  injectColorBlindnessFilters();

  // High contrast
  if (settings.highContrast) {
    root.classList.add('high-contrast');
  } else {
    root.classList.remove('high-contrast');
  }

  // Large text
  if (settings.largeText) {
    root.classList.add('large-text');
  } else {
    root.classList.remove('large-text');
  }

  // Reduced motion
  if (settings.reducedMotion) {
    root.classList.add('reduced-motion');
  } else {
    root.classList.remove('reduced-motion');
  }

  // Screen reader optimized
  if (settings.screenReaderOptimized) {
    body.setAttribute('aria-live', 'polite');
  } else {
    body.removeAttribute('aria-live');
  }

  // Focus visible
  if (settings.focusVisible) {
    root.classList.add('focus-visible');
  } else {
    root.classList.remove('focus-visible');
  }

  // Color blindness
  applyColorBlindnessFilter(settings.colorBlindMode);
}

// ─── ARIA Utilities ─────────────────────────────────────────────────────────

/**
 * Generate ARIA attributes for a listbox.
 */
export function getListboxAriaProps(id: string, activeIndex: number, _itemCount: number) {
  return {
    role: 'listbox' as const,
    id,
    'aria-activedescendant': `${id}-item-${activeIndex}`,
    'aria-multiselectable': 'false',
    tabIndex: 0,
  };
}

/**
 * Generate ARIA attributes for a listbox option.
 */
export function getListboxOptionAriaProps(id: string, index: number, selected: boolean) {
  return {
    role: 'option' as const,
    id: `${id}-item-${index}`,
    'aria-selected': selected,
    tabIndex: -1,
  };
}

/**
 * Generate ARIA attributes for a dialog.
 */
export function getDialogAriaProps(titleId: string, descriptionId?: string) {
  return {
    role: 'dialog' as const,
    'aria-modal': 'true',
    'aria-labelledby': titleId,
    ...(descriptionId ? { 'aria-describedby': descriptionId } : {}),
  };
}

/**
 * Generate ARIA attributes for a tab panel.
 */
export function getTabPanelAriaProps(tabId: string, selected: boolean) {
  return {
    role: 'tabpanel' as const,
    'aria-labelledby': tabId,
    hidden: !selected || undefined,
  };
}

/**
 * Generate ARIA attributes for a button with popup.
 */
export function getPopupButtonAriaProps(popupId: string, expanded: boolean) {
  return {
    'aria-haspopup': 'true',
    'aria-expanded': expanded,
    'aria-controls': popupId,
  };
}

/**
 * Generate live region announcement for screen readers.
 */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  if (!canUseDOM()) return;

  const region = document.createElement('div');
  region.setAttribute('aria-live', priority);
  region.setAttribute('aria-atomic', 'true');
  region.className = 'sr-only';
  region.textContent = message;

  document.body.appendChild(region);

  // Remove after announcement
  setTimeout(() => {
    if (document.body.contains(region)) {
      document.body.removeChild(region);
    }
  }, 1000);
}

// ─── Focus Management ───────────────────────────────────────────────────────

/**
 * Trap focus within an element (for modals/dialogs).
 */
export function trapFocus(element: HTMLElement): () => void {
  if (!canUseDOM()) return () => {};

  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  const focusableElements = element.querySelectorAll<HTMLElement>(focusableSelectors);
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  const handler = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;

    if (event.shiftKey) {
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    }
  };

  element.addEventListener('keydown', handler);
  firstElement?.focus();

  return () => element.removeEventListener('keydown', handler);
}

/**
 * Restore focus to a previously focused element.
 */
export function restoreFocus(element: HTMLElement | null): void {
  if (!canUseDOM()) return;
  if (element && document.body.contains(element)) {
    element.focus();
  }
}

/**
 * Get the previously focused element.
 */
let previouslyFocused: HTMLElement | null = null;

export function savePreviouslyFocused(): void {
  if (!canUseDOM()) return;
  previouslyFocused = document.activeElement as HTMLElement;
}

export function getPreviouslyFocused(): HTMLElement | null {
  return previouslyFocused;
}

// ─── Skip Links ─────────────────────────────────────────────────────────────

export interface SkipLinksOptions {
  includeMainContent?: boolean;
  includeChatLinks?: boolean;
}

/**
 * Remove previously injected skip links container.
 */
export function removeSkipLinks(): void {
  if (!canUseDOM()) return;
  const existing = document.getElementById('skip-links');
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }
}

/**
 * Create skip navigation links.
 * Disabled in current UI configuration.
 */
export function createSkipLinks(options: SkipLinksOptions = {}): void {
  if (!canUseDOM()) return;
  void options;
  // Hard-disabled by product requirement: do not render skip-link UI.
  removeSkipLinks();
}

export interface AppShortcutActions {
  focusSearch: () => void;
  openNewContact: () => void;
  goBack: () => void;
  focusMessageInput: () => void;
  announceShortcuts: () => void;
}

/**
 * Registers the default app-level keyboard shortcuts.
 * Returns a cleanup function.
 */
export function registerDefaultAppShortcuts(actions: AppShortcutActions): () => void {
  const disposers: Array<() => void> = [];

  disposers.push(
    registerShortcut({
      key: 'k',
      ctrl: true,
      description: 'Открыть поиск',
      category: 'navigation',
      handler: actions.focusSearch,
    }),
  );

  disposers.push(
    registerShortcut({
      key: '/',
      ctrl: true,
      description: 'Фокус на поиск',
      category: 'navigation',
      handler: actions.focusSearch,
    }),
  );

  disposers.push(
    registerShortcut({
      key: 'n',
      ctrl: true,
      description: 'Новый контакт',
      category: 'navigation',
      handler: actions.openNewContact,
    }),
  );

  disposers.push(
    registerShortcut({
      key: 'Escape',
      description: 'Закрыть/назад',
      category: 'navigation',
      handler: actions.goBack,
    }),
  );

  disposers.push(
    registerShortcut({
      key: 'Enter',
      ctrl: true,
      description: 'Фокус на вводе сообщения',
      category: 'messaging',
      handler: actions.focusMessageInput,
    }),
  );

  disposers.push(
    registerShortcut({
      key: '?',
      shift: true,
      description: 'Показать горячие клавиши',
      category: 'general',
      handler: actions.announceShortcuts,
    }),
  );

  return () => {
    for (const dispose of disposers) dispose();
  };
}
