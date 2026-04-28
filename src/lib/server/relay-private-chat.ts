import { db } from '@/lib/db';
import { getRelayHttpBaseUrl } from '@/lib/relay-base-url';
import { resolveRelayIdentity } from '@/lib/server/relay-identity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

type WebUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  avatar?: string | null;
};

type CanonicalPrivateChatResult = {
  chatId: string;
  memberIds: string[];
  reused: boolean;
};

export class CanonicalPrivateChatError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function createCanonicalPrivateChat(
  requester: WebUser,
  recipientId: string,
): Promise<CanonicalPrivateChatResult> {
  const requesterIdentity = await resolveRelayIdentity(requester);

  const payload: {
    requesterRelayUserId: string;
    recipientRelayUserId?: string;
    recipientLegacyWebUserId?: string;
    recipientEmail?: string;
    recipientName?: string;
    recipientAvatar?: string;
  } = {
    requesterRelayUserId: requesterIdentity.relayUserId,
  };

  if (isUuid(recipientId)) {
    payload.recipientRelayUserId = recipientId;
  } else {
    const recipient = await db.user.findUnique({
      where: { id: recipientId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
      },
    });

    if (!recipient) {
      throw new CanonicalPrivateChatError('Recipient not found', 'RECIPIENT_NOT_FOUND', 404);
    }

    payload.recipientLegacyWebUserId = recipient.id;
    if (recipient.email) {
      payload.recipientEmail = recipient.email;
    }
    if (recipient.name) {
      payload.recipientName = recipient.name;
    }
    if (recipient.avatar) {
      payload.recipientAvatar = recipient.avatar;
    }
  }

  const internalApiKey = process.env.INTERNAL_API_KEY || '';
  if (!internalApiKey) {
    throw new CanonicalPrivateChatError(
      'INTERNAL_API_KEY is not configured',
      'IDENTITY_BRIDGE_CONFIG_MISSING',
      500,
    );
  }

  const response = await fetch(`${getRelayHttpBaseUrl()}/internal/chats/private/upsert`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${internalApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as
      | { code?: string; error?: string }
      | null;

    throw new CanonicalPrivateChatError(
      errorPayload?.error || `Private chat upsert failed (${response.status})`,
      errorPayload?.code || 'PRIVATE_CHAT_CREATE_FAILED',
      response.status,
    );
  }

  const data = (await response.json()) as {
    success?: boolean;
    data?: { id?: string; memberIds?: string[]; reused?: boolean };
  };

  if (!data.success || !data.data?.id || !Array.isArray(data.data.memberIds)) {
    throw new CanonicalPrivateChatError(
      'Private chat upsert returned invalid response',
      'PRIVATE_CHAT_INVALID_RESPONSE',
      502,
    );
  }

  return {
    chatId: data.data.id,
    memberIds: data.data.memberIds,
    reused: Boolean(data.data.reused),
  };
}
