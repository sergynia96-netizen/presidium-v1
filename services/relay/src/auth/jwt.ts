/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * JWT Authentication for Presidium Relay
 */

import { jwtVerify, type JWTPayload, SignJWT } from 'jose';

import { config } from '../config.js';

const SECRET = new TextEncoder().encode(config.JWT_SECRET);

export interface TokenPayload extends JWTPayload {
  sub: string;
  email: string;
  legacyWebUserId?: string;
  deviceId?: string;
  tier?: 'free' | 'local_ai' | 'cloud_ai';
}

export async function createToken(
  userId: string,
  email: string,
  deviceId?: string,
  tier?: string
): Promise<string> {
  const token = new SignJWT({
    email,
    deviceId,
    tier,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('7d')
    .setAudience('presidium-relay')
    .setIssuer('presidium-api');

  return token.sign(SECRET);
}

export async function createRefreshToken(
  userId: string,
  deviceId: string
): Promise<string> {
  const token = new SignJWT({ deviceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('30d')
    .setAudience('presidium-refresh')
    .setIssuer('presidium-api');

  return token.sign(SECRET);
}

export async function verifyToken(
  token: string,
  expectedAudience: 'presidium-relay' | 'presidium-refresh' = 'presidium-relay'
): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, SECRET, {
    clockTolerance: 60,
    maxTokenAge: expectedAudience === 'presidium-relay' ? '7d' : '30d',
    audience: expectedAudience,
    issuer: 'presidium-api',
  });

  if (!payload.sub) {
    throw new Error('Invalid token: missing subject (user ID)');
  }

  return payload as TokenPayload;
}

export function extractTokenFromUrl(url: string): { token: string | null; deviceId: string | null } {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) {
    return { token: null, deviceId: null };
  }

  const params = new URLSearchParams(url.slice(queryIndex + 1));

  return {
    token: params.get('token'),
    deviceId: params.get('deviceId'),
  };
}
