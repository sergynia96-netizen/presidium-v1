export function getRelayHttpBaseUrl(): string {
  // Client-side: must use NEXT_PUBLIC_ prefix to be available in browser
  if (typeof window !== 'undefined') {
    return (process.env.NEXT_PUBLIC_RELAY_HTTP_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
  }
  // Server-side: can use non-NEXT_PUBLIC_ variables as fallback
  return (
    process.env.RELAY_HTTP_URL ||
    process.env.NEXT_PUBLIC_RELAY_HTTP_URL ||
    'http://127.0.0.1:3001'
  ).replace(/\/+$/, '');
}
