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

export class RelayIdentityError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function resolveRelayIdentity(user: RelayIdentityInput): Promise<RelayIdentityResult> {
  if (!user.id) {
    throw new RelayIdentityError('Missing web user ID', 'IDENTITY_WEB_ID_MISSING', 400);
  }
  if (!user.email) {
    throw new RelayIdentityError('Missing web user email', 'IDENTITY_EMAIL_MISSING', 400);
  }

  const internalApiKey = process.env.INTERNAL_API_KEY || '';
  if (!internalApiKey) {
    throw new RelayIdentityError('INTERNAL_API_KEY is not configured', 'IDENTITY_BRIDGE_CONFIG_MISSING', 500);
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
    const payload = (await response.json().catch(() => null)) as { code?: string; error?: string } | null;
    throw new RelayIdentityError(
      payload?.error || `Relay identity sync failed (${response.status})`,
      payload?.code || 'IDENTITY_BRIDGE_REQUEST_FAILED',
      response.status
    );
  }

  const payload = (await response.json()) as {
    success?: boolean;
    data?: { relayUserId?: string };
  };
  const relayUserId = payload.data?.relayUserId;
  if (!payload.success || !relayUserId) {
    throw new RelayIdentityError(
      'Relay identity sync returned invalid response',
      'IDENTITY_BRIDGE_INVALID_RESPONSE',
      502
    );
  }

  return { relayUserId };
}
