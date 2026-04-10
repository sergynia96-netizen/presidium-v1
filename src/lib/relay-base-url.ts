export function getRelayHttpBaseUrl(): string {
  return (
    process.env.RELAY_HTTP_URL ||
    process.env.NEXT_PUBLIC_RELAY_HTTP_URL ||
    'http://127.0.0.1:3001'
  ).replace(/\/+$/, '');
}
