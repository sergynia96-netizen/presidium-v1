import { getRelayHttpBaseUrl } from '@/lib/relay-base-url';

type RelayIdentityInput = {
  id: string;
  email?: string | null;
  name?: string | null;
  avatar?: string | null;
};

type RelayIdentityResult = {
  relayUserId: string;
};

export async function resolveRelayIdentity(user: RelayIdentityInput): Promise<RelayIdentityResult> {
  if (!user.id) {
    throw new Error('Missing web user ID');
  }
  if (!user.email) {
    throw new Error('Missing web user email');
  }

  const internalApiKey = process.env.INTERNAL_API_KEY || '';
  if (!internalApiKey) {
    throw new Error('INTERNAL_API_KEY is not configured');
  }

  const response = await fetch(`${getRelayHttpBaseUrl()}/internal/users/sync-web-user`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${internalApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      legacyWebUserId: user.id,
      email: user.email,
      name: user.name || undefined,
      avatar: user.avatar || undefined,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Relay identity sync failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    success?: boolean;
    data?: { relayUserId?: string };
  };
  const relayUserId = payload.data?.relayUserId;
  if (!payload.success || !relayUserId) {
    throw new Error('Relay identity sync returned invalid response');
  }

  return { relayUserId };
}
