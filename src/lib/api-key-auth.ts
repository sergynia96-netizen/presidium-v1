import { createHash, randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';

export interface ApiKeyAuthContext {
  apiKeyId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  permissions: string[];
}

export type ApiKeyAuthResult =
  | { ok: true; context: ApiKeyAuthContext }
  | { ok: false; status: number; error: string };

function toPermissionSet(values: string[]): string[] {
  const uniq = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    uniq.add(normalized);
  }
  return Array.from(uniq);
}

export function parsePermissions(raw: string): string[] {
  if (!raw || !raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return toPermissionSet(parsed.filter((item): item is string => typeof item === 'string'));
    }
  } catch {
    // Fallback below for legacy comma-separated storage
  }

  return toPermissionSet(raw.split(','));
}

export function serializePermissions(input?: string[]): string {
  const permissions = input && input.length > 0 ? toPermissionSet(input) : ['messages:write'];
  return JSON.stringify(permissions);
}

export function hashApiKey(plainToken: string): string {
  return createHash('sha256').update(plainToken).digest('hex');
}

export function generateApiKeyToken(): string {
  return `pk_${randomBytes(32).toString('hex')}`;
}

export function hasPermission(permissions: string[], requiredPermission: string): boolean {
  if (!requiredPermission) return true;
  if (permissions.includes('*')) return true;
  if (permissions.includes(requiredPermission)) return true;

  const [resource] = requiredPermission.split(':');
  if (resource && permissions.includes(`${resource}:*`)) return true;

  return false;
}

function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header) return null;

  const [scheme, token] = header.split(' ');
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return token.trim() || null;
}

export async function authenticateApiKey(
  request: NextRequest,
  requiredPermission?: string,
): Promise<ApiKeyAuthResult> {
  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: 'Missing Bearer token' };
  }

  const hashed = hashApiKey(token);
  const apiKey = await db.apiKey.findUnique({
    where: { key: hashed },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          avatar: true,
        },
      },
    },
  });

  if (!apiKey) {
    return { ok: false, status: 401, error: 'Invalid API key' };
  }

  if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) {
    return { ok: false, status: 401, error: 'API key expired' };
  }

  const permissions = parsePermissions(apiKey.permissions);
  if (requiredPermission && !hasPermission(permissions, requiredPermission)) {
    return { ok: false, status: 403, error: 'Insufficient API key permissions' };
  }

  await db.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsed: new Date() },
  });

  return {
    ok: true,
    context: {
      apiKeyId: apiKey.id,
      userId: apiKey.user.id,
      userName: apiKey.user.name,
      userAvatar: apiKey.user.avatar || '',
      permissions,
    },
  };
}
