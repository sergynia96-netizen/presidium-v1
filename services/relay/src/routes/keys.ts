/**
 * Presidium Relay — Pre-Key Bundle Routes
 *
 * Compatibility layer for the current web E2E client.
 *
 * The root web app still owns user identity through the Prisma/SQLite model.
 * For that reason these routes verify the relay JWT cryptographically but do
 * not require a matching user row in the relay Postgres users table yet.
 *
 * Storage is Redis-backed during the transition. The final production target is
 * to move pre-key bundles into the canonical relay Postgres schema once the web
 * user/chat APIs are migrated away from the legacy root Prisma model.
 */

import { Hono } from 'hono';
import { z } from 'zod';

import { verifyToken, type TokenPayload } from '../auth/jwt.js';
import { apiRateLimit } from '../middleware/rate-limit.js';
import { redis } from '../redis.js';

const app = new Hono();
const PREKEY_BUNDLE_TTL_SECONDS = 30 * 24 * 60 * 60;

const signedPreKeySchema = z.object({
  keyId: z.number().int().nonnegative().optional(),
  publicKey: z.string().min(16).max(2048),
  signature: z.string().min(16).max(4096),
});

const oneTimePreKeySchema = z.object({
  keyId: z.number().int().nonnegative().optional(),
  preKeyId: z.number().int().nonnegative().optional(),
  publicKey: z.string().min(16).max(2048),
});

const preKeyUploadSchema = z.object({
  identityKey: z.string().min(16).max(4096),
  signedPreKey: z.union([signedPreKeySchema, z.string().min(16).max(2048)]),
  signature: z.string().min(16).max(4096).optional(),
  oneTimePreKeys: z.array(oneTimePreKeySchema).max(500).default([]),
});

type StoredPreKeyBundle = {
  userId: string;
  identityKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKeys: {
    keyId: number;
    publicKey: string;
  }[];
  uploadedAt: number;
};

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

async function getRelayTokenPayload(c: unknown): Promise<TokenPayload | null> {
  const ctx = c as { req: { header: (name: string) => string | undefined } };
  const token = parseBearerToken(
    ctx.req.header('Authorization') || ctx.req.header('authorization')
  );
  if (!token) return null;
  return verifyToken(token);
}

function bundleKey(userId: string): string {
  return `prekeys:bundle:${userId}`;
}

function normalizeBundle(userId: string, input: z.infer<typeof preKeyUploadSchema>): StoredPreKeyBundle {
  const signedPreKey =
    typeof input.signedPreKey === 'string'
      ? {
          keyId: 0,
          publicKey: input.signedPreKey,
          signature: input.signature || '',
        }
      : {
          keyId: input.signedPreKey.keyId ?? 0,
          publicKey: input.signedPreKey.publicKey,
          signature: input.signedPreKey.signature,
        };

  return {
    userId,
    identityKey: input.identityKey,
    signedPreKey,
    oneTimePreKeys: input.oneTimePreKeys.map((key, index) => ({
      keyId: key.keyId ?? key.preKeyId ?? index,
      publicKey: key.publicKey,
    })),
    uploadedAt: Date.now(),
  };
}

app.post('/upload', apiRateLimit, async (c) => {
  let tokenPayload: TokenPayload | null = null;
  try {
    tokenPayload = await getRelayTokenPayload(c);
  } catch (err) {
    return c.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Invalid relay token',
        code: 'AUTH_INVALID_TOKEN',
      },
      401
    );
  }

  if (!tokenPayload?.sub) {
    return c.json(
      {
        success: false,
        error: 'Missing relay bearer token',
        code: 'AUTH_MISSING',
      },
      401
    );
  }

  const raw = await c.req.json().catch(() => null);
  const parsed = preKeyUploadSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: 'Invalid pre-key bundle',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
      400
    );
  }

  const bundle = normalizeBundle(tokenPayload.sub, parsed.data);
  await redis.set(bundleKey(tokenPayload.sub), JSON.stringify(bundle), 'EX', PREKEY_BUNDLE_TTL_SECONDS);

  return c.json({
    success: true,
    data: {
      userId: tokenPayload.sub,
      uploadedAt: bundle.uploadedAt,
      oneTimePreKeyCount: bundle.oneTimePreKeys.length,
      ttlSeconds: PREKEY_BUNDLE_TTL_SECONDS,
    },
  });
});

app.get('/:userId', apiRateLimit, async (c) => {
  const userId = c.req.param('userId');
  const rawBundle = await redis.get(bundleKey(userId));

  if (!rawBundle) {
    return c.json(
      {
        success: false,
        error: 'Pre-key bundle not found',
        code: 'PREKEY_BUNDLE_NOT_FOUND',
      },
      404
    );
  }

  let bundle: StoredPreKeyBundle;
  try {
    bundle = JSON.parse(rawBundle) as StoredPreKeyBundle;
  } catch {
    return c.json(
      {
        success: false,
        error: 'Stored pre-key bundle is corrupted',
        code: 'PREKEY_BUNDLE_CORRUPTED',
      },
      500
    );
  }

  return c.json({
    identityKey: bundle.identityKey,
    signedPreKey: bundle.signedPreKey,
    oneTimePreKeys: bundle.oneTimePreKeys,
    userId: bundle.userId,
    uploadedAt: bundle.uploadedAt,
  });
});

export default app;
