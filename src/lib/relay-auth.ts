export function getRelayAccessToken(): string | null {
  if (typeof window === 'undefined') return null;

  // Only use dedicated relay token keys.
  // Do not reuse NextAuth/session tokens from unrelated storage keys.
  const primary = localStorage.getItem('presidium_access_token');
  if (primary && primary.trim().length > 0) return primary;

  const legacy = localStorage.getItem('relay_access_token');
  if (legacy && legacy.trim().length > 0) return legacy;

  return null;
}

export function setRelayAccessToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('presidium_access_token', token);
}

export function clearRelayAccessToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('presidium_access_token');
  localStorage.removeItem('relay_access_token');
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
