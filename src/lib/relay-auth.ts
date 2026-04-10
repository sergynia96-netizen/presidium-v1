export function getRelayAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    localStorage.getItem('presidium_access_token') ||
    localStorage.getItem('next-auth.session-token') ||
    localStorage.getItem('auth-token')
  );
}

export function getRelayAuthHeaders(
  base: Record<string, string> = {},
): Record<string, string> {
  const token = getRelayAccessToken();
  if (!token) return base;
  return {
    ...base,
    Authorization: `Bearer ${token}`,
  };
}
