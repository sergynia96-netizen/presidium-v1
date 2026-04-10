import argon2 from 'argon2';
import { randomInt } from 'crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { prisma } from '../prisma';

const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET (or NEXTAUTH_SECRET) is required for relay-backend');
  }
  return secret;
})();

const RELAY_DEV_OTP_PREVIEW =
  process.env.RELAY_DEV_OTP_PREVIEW === 'true' &&
  process.env.NODE_ENV !== 'production';

function generateOtpCode(): string {
  return String(randomInt(100000, 1000000));
}

export interface TokenPair {
  accessToken: string;
  expiresIn: number;
}

// ─── Register ──────────────────────────────────────

export async function register(data: {
  email: string;
  password: string;
  displayName: string;
  username?: string;
  publicKey: string;
  signedPreKey: string;
  oneTimePreKeys: string[];
}) {
  // Check if email exists
  const existing = await prisma.account.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) {
    return { error: 'Email already registered' };
  }

  // Check username uniqueness
  if (data.username) {
    const existingName = await prisma.account.findUnique({ where: { username: data.username.toLowerCase() } });
    if (existingName) {
      return { error: 'Username already taken' };
    }
  }

  // Hash password
  const passwordHash = await argon2.hash(data.password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // Create account + OTP code in transaction
  const otpCode = generateOtpCode();

  const account = await prisma.account.create({
    data: {
      email: data.email.toLowerCase(),
      passwordHash,
      displayName: data.displayName,
      username: data.username?.toLowerCase(),
      publicKey: data.publicKey,
      otpCodes: {
        create: {
          code: otpCode,
          purpose: 'verify_email',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
        },
      },
      preKeys: {
        create: [
          { preKeyId: 0, publicKey: data.signedPreKey },
          ...data.oneTimePreKeys.map((key, i) => ({
            preKeyId: i + 1,
            publicKey: key,
          })),
        ],
      },
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      username: true,
    },
  });

  // OTP must never be logged. Optional preview is available only in explicit dev mode.
  const response: {
    account: { id: string; email: string; displayName: string; username: string | null };
    message: string;
    devOtpPreview?: string;
  } = {
    account,
    message: 'Verification code sent to email',
  };
  if (RELAY_DEV_OTP_PREVIEW) {
    response.devOtpPreview = otpCode;
  }
  return response;
}

// ─── Verify Email ─────────────────────────────────

export async function verifyEmail(email: string, code: string) {
  const account = await prisma.account.findUnique({
    where: { email: email.toLowerCase() },
    include: { otpCodes: { where: { purpose: 'verify_email', used: false } } },
  });

  if (!account) {
    return { error: 'Account not found' };
  }

  const otp = account.otpCodes.find(
    (o) => o.code === code && o.expiresAt > new Date()
  );

  if (!otp) {
    return { error: 'Invalid or expired verification code' };
  }

  // Mark OTP as used
  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { used: true },
  });

  // Delete all unused OTPs for this account
  await prisma.otpCode.deleteMany({
    where: {
      accountId: account.id,
      purpose: 'verify_email',
      used: false,
    },
  });

  return { success: true, message: 'Email verified successfully' };
}

// ─── Login ────────────────────────────────────────

export async function login(email: string, password: string, deviceInfo?: string, ip?: string): Promise<{ tokens?: TokenPair; error?: string }> {
  const account = await prisma.account.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!account) {
    return { error: 'Invalid credentials' };
  }

  // Verify password
  const valid = await argon2.verify(account.passwordHash, password);
  if (!valid) {
    return { error: 'Invalid credentials' };
  }

  // Generate JWT
  const tokens = await generateTokens(account.id, 'web', deviceInfo, ip);

  return { tokens };
}

// ─── Generate Tokens ──────────────────────────────

export async function generateTokens(
  accountId: string,
  deviceId: string,
  deviceInfo?: string,
  ip?: string,
): Promise<TokenPair> {
  const payload = {
    accountId,
    deviceId,
    iat: Math.floor(Date.now() / 1000),
  };

  const expiresInSec = 7 * 24 * 60 * 60; // 7 days
  const accessToken = jwt.sign(payload, JWT_SECRET, {
    expiresIn: expiresInSec,
  });

  // Store session (use lightweight hash for session — JWT already provides security)
  const tokenHash = accessToken; // Store raw token for simple lookup (JWT is already signed)
  await prisma.session.create({
    data: {
      accountId,
      tokenHash,
      deviceInfo: deviceInfo || 'unknown',
      ip: ip || 'unknown',
      expiresAt: new Date(Date.now() + expiresInSec * 1000),
    },
  });

  return { accessToken, expiresIn: expiresInSec };
}

// ─── Verify JWT ────────────────────────────────────

/**
 * Verify JWT — supports both relay-native tokens and NextAuth-issued tokens.
 *
 * Relay tokens contain:  { accountId, deviceId }
 * NextAuth tokens contain: { sub, id, email }  (issued by /api/relay/token)
 *
 * When a NextAuth token is presented, the accountId = sub (NextAuth userId).
 */
export function verifyJWT(token: string): { accountId: string; deviceId: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (typeof payload !== 'object' || payload === null) {
      return null;
    }

    const claims = payload as JwtPayload;

    // Format 1: Relay-native token (has accountId + deviceId)
    if (typeof claims.accountId === 'string' && typeof claims.deviceId === 'string') {
      return { accountId: claims.accountId, deviceId: claims.deviceId };
    }

    // Format 2: NextAuth bridge token (has sub or id, issued by /api/relay/token)
    const nextAuthId = claims.sub || claims.id;
    if (typeof nextAuthId === 'string') {
      return { accountId: nextAuthId, deviceId: 'web' };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Ensure a relay Account exists for a given NextAuth userId.
 * Called on WebSocket auth to auto-provision the relay side.
 */
export async function ensureAccountExists(
  accountId: string,
  email?: string | null,
): Promise<void> {
  const existing = await prisma.account.findUnique({ where: { id: accountId } });
  if (existing) return;

  // Auto-create a minimal relay account for the NextAuth user
  await prisma.account.create({
    data: {
      id: accountId,
      email: email || `${accountId}@presidium.local`,
      passwordHash: '', // No password — auth is handled by NextAuth
      displayName: email?.split('@')[0] || accountId,
      publicKey: '', // Will be populated when E2E initializes
    },
  });

  console.log(`[Auth] Auto-provisioned relay account for NextAuth user: ${accountId}`);
}

// ─── Resend OTP ────────────────────────────────────

export async function resendOtp(email: string) {
  const account = await prisma.account.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (!account) {
    return { error: 'Account not found' };
  }

  const otpCode = generateOtpCode();

  await prisma.otpCode.create({
    data: {
      accountId: account.id,
      code: otpCode,
      purpose: 'verify_email',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  // OTP must never be logged. Optional preview is available only in explicit dev mode.
  const response: {
    success: true;
    message: string;
    devOtpPreview?: string;
  } = { success: true, message: 'Verification code resent' };
  if (RELAY_DEV_OTP_PREVIEW) {
    response.devOtpPreview = otpCode;
  }
  return response;
}
