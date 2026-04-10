/**
 * Sentry Crash Reporting Integration
 *
 * Initializes Sentry for error tracking and performance monitoring.
 * Configured for both browser and Next.js App Router.
 *
 * Note: @sentry/nextjs is optional. Install with:
 *   npm install @sentry/nextjs
 */

let Sentry: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Sentry = require('@sentry/nextjs');
} catch {
  // Sentry not installed - use no-op implementation
  Sentry = {
    init: () => {},
    setUser: () => {},
    captureException: (e: Error) => console.error('[Sentry]', e),
    captureMessage: (m: string) => console.log('[Sentry]', m),
    addBreadcrumb: () => {},
  };
}

export function initSentry() {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SENTRY_DSN && Sentry?.init) {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_ENV || 'production',
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0.01,
      replaysOnErrorSampleRate: 1.0,
      ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        'Network Error',
      ],
      beforeSend: (event: any) => {
        if (event.request?.headers) {
          delete event.request.headers['Authorization'];
          delete event.request.headers['Cookie'];
        }
        return event;
      },
    });
  }
}

export function setSentryUser(userId: string, email?: string): void {
  if (process.env.NODE_ENV === 'production' && Sentry?.setUser) {
    Sentry.setUser({ id: userId, email });
  }
}

export function clearSentryUser(): void {
  if (process.env.NODE_ENV === 'production' && Sentry?.setUser) {
    Sentry.setUser(null);
  }
}

export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (Sentry?.captureException) {
    Sentry.captureException(error, { extra: context });
  } else {
    console.error('[Error]', error, context);
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (Sentry?.captureMessage) {
    Sentry.captureMessage(message, { level });
  } else {
    console[level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log']('[Message]', message);
  }
}

export function addBreadcrumb(message: string, category?: string, data?: Record<string, unknown>): void {
  if (Sentry?.addBreadcrumb) {
    Sentry.addBreadcrumb({ message, category, data });
  }
}
