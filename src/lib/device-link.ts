import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';

const DEVICE_LINK_IDENTIFIER_PREFIX = 'device-link';
const DEVICE_LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEVICE_LINK_CODE_LENGTH = 8;
const DEVICE_LINK_TTL_MS = 10 * 60 * 1000;

type DeviceLinkUser = {
  id: string;
  email: string;
  name: string;
  avatar: string;
};

function getDeviceLinkIdentifier(ownerUserId: string): string {
  return `${DEVICE_LINK_IDENTIFIER_PREFIX}:${ownerUserId}`;
}

function getHashSecret(): string {
  return process.env.NEXTAUTH_SECRET || 'presidium-device-link-dev-secret';
}

function hashDeviceLinkCode(ownerUserId: string, normalizedCode: string): string {
  return createHash('sha256')
    .update(`${ownerUserId}:${normalizedCode}:${getHashSecret()}`)
    .digest('hex');
}

function secureCompareHex(left: string, right: string): boolean {
  try {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    if (leftBuffer.length === 0 || rightBuffer.length === 0) return false;
    if (leftBuffer.length !== rightBuffer.length) return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

export function normalizeDeviceLinkCode(rawCode: string): string {
  return rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatDeviceLinkCode(rawCode: string): string {
  const normalized = normalizeDeviceLinkCode(rawCode);
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}

function generateRawDeviceLinkCode(): string {
  let value = '';
  for (let i = 0; i < DEVICE_LINK_CODE_LENGTH; i += 1) {
    const idx = randomInt(0, DEVICE_LINK_CODE_ALPHABET.length);
    value += DEVICE_LINK_CODE_ALPHABET[idx];
  }
  return value;
}

export async function issueDeviceLinkCode(ownerUserId: string): Promise<{
  ownerUserId: string;
  code: string;
  displayCode: string;
  expiresAt: string;
}> {
  const code = generateRawDeviceLinkCode();
  const normalizedCode = normalizeDeviceLinkCode(code);
  const tokenHash = hashDeviceLinkCode(ownerUserId, normalizedCode);
  const expiresAt = new Date(Date.now() + DEVICE_LINK_TTL_MS);
  const identifier = getDeviceLinkIdentifier(ownerUserId);

  await db.verificationToken.deleteMany({
    where: { identifier },
  });

  await db.verificationToken.create({
    data: {
      identifier,
      token: tokenHash,
      expires: expiresAt,
    },
  });

  return {
    ownerUserId,
    code: normalizedCode,
    displayCode: formatDeviceLinkCode(normalizedCode),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function revokeDeviceLinkCode(ownerUserId: string): Promise<number> {
  const identifier = getDeviceLinkIdentifier(ownerUserId);
  const deleted = await db.verificationToken.deleteMany({
    where: { identifier },
  });
  return deleted.count;
}

export async function consumeDeviceLinkCode(
  ownerUserId: string,
  rawCode: string,
): Promise<DeviceLinkUser | null> {
  const identifier = getDeviceLinkIdentifier(ownerUserId);
  const normalizedCode = normalizeDeviceLinkCode(rawCode);
  if (!normalizedCode) return null;

  const tokenRow = await db.verificationToken.findFirst({
    where: {
      identifier,
      expires: { gt: new Date() },
    },
    orderBy: {
      expires: 'desc',
    },
  });

  if (!tokenRow) return null;

  const incomingHash = hashDeviceLinkCode(ownerUserId, normalizedCode);
  const valid = secureCompareHex(incomingHash, tokenRow.token);

  if (!valid) {
    return null;
  }

  await db.verificationToken.deleteMany({
    where: { identifier },
  });

  const user = await db.user.findUnique({
    where: { id: ownerUserId },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
    },
  });

  if (!user) return null;
  return user;
}
