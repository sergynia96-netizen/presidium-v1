/**
 * Push Notification Service
 *
 * Handles push notifications for:
 * - New messages (when app is closed/minimized)
 * - Call invitations
 * - Story notifications
 * - System notifications
 *
 * Architecture:
 * - Web Push API for web
 * - FCM for Android (via service worker)
 * - APNs for iOS (via service worker)
 * - Notification actions (reply, mark as read)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PushNotificationPayload {
  type: 'message' | 'call' | 'story' | 'system';
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data: Record<string, unknown>;
  actions?: PushAction[];
  tag?: string;
  renotify?: boolean;
  silent?: boolean;
}

export interface PushAction {
  action: string;
  title: string;
  icon?: string;
}

// ─── Service Worker Registration ─────────────────────────────────────────────

/**
 * Register the push notification service worker.
 */
export async function registerPushService(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    // Request notification permission
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      return registration;
    }

    // Subscribe to push notifications
    await subscribeToPush(registration);

    return registration;
  } catch (error) {
    console.error('[Push] Failed to register service worker:', error);
    return null;
  }
}

/**
 * Request notification permission from the user.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }

  return Notification.requestPermission();
}

/**
 * Subscribe to push notifications.
 * Sends the subscription to the server.
 */
async function subscribeToPush(registration: ServiceWorkerRegistration): Promise<void> {
  try {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
    if (!vapidPublicKey || vapidPublicKey.length < 40) {
      console.warn('[Push] VAPID public key is missing or invalid. Push subscription skipped.');
      return;
    }

    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    if (applicationServerKey.length === 0) {
      console.warn('[Push] VAPID public key decoded to empty value. Push subscription skipped.');
      return;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
    });

    // Send subscription to server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });
  } catch (error) {
    console.error('[Push] Failed to subscribe:', error);
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      await subscription.unsubscribe();

      // Notify server
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    }
  } catch (error) {
    console.error('[Push] Failed to unsubscribe:', error);
  }
}

// ─── Local Notifications ────────────────────────────────────────────────────

/**
 * Show a local notification (when app is in foreground).
 */
export function showLocalNotification(payload: PushNotificationPayload): void {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const notification = new Notification(payload.title, {
    body: payload.body,
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/badge-72.png',
    tag: payload.tag,
    silent: payload.silent,
    data: payload.data,
  } as NotificationOptions);

  notification.onclick = () => {
    window.focus();
    notification.close();
    handleNotificationClick(payload);
  };
}

/**
 * Handle notification click.
 */
function handleNotificationClick(payload: PushNotificationPayload): void {
  switch (payload.type) {
    case 'message':
      // Navigate to chat
      const chatId = payload.data.chatId as string | undefined;
      if (chatId) {
        window.location.href = `/chat/${chatId}`;
      }
      break;
    case 'call':
      // Open call screen
      window.location.href = '/call';
      break;
    case 'story':
      // Open stories
      window.location.href = '/stories';
      break;
    default:
      break;
  }
}

/**
 * Handle notification action (used by service worker).
 * Exported for future use when action buttons are implemented.
 */
export function handleNotificationAction(_action: string, _payload: PushNotificationPayload): void {
  const action = _action.trim().toLowerCase();
  const payload = _payload;

  if (action === 'dismiss') {
    return;
  }

  if (action === 'open') {
    handleNotificationClick(payload);
    return;
  }

  if (action === 'mark_read') {
    const chatId = payload.data.chatId as string | undefined;
    const messageId = payload.data.messageId as string | undefined;
    if (!chatId || !messageId) return;

    void fetch(`/api/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'read', chatId }),
    }).catch(() => {});
    return;
  }

  if (action === 'reply') {
    const chatId = payload.data.chatId as string | undefined;
    const quickReply = payload.data.reply as string | undefined;
    if (!chatId || !quickReply?.trim()) return;

    void fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId,
        content: quickReply.trim(),
        type: 'text',
      }),
    }).catch(() => {});
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Convert VAPID public key from base64 to Uint8Array.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

/**
 * Check if push notifications are supported and enabled.
 */
export function isPushEnabled(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    Notification.permission === 'granted'
  );
}
