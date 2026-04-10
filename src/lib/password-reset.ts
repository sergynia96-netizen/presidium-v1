import { createHash, randomBytes } from 'crypto';

const RESET_PREFIX = 'password_reset:';
const RESET_TTL_MS = 30 * 60 * 1000;

export function getPasswordResetIdentifier(email: string): string {
  return `${RESET_PREFIX}${email.toLowerCase()}`;
}

export function extractEmailFromResetIdentifier(identifier: string): string | null {
  if (!identifier.startsWith(RESET_PREFIX)) return null;
  const email = identifier.slice(RESET_PREFIX.length).trim().toLowerCase();
  return email || null;
}

export function generatePasswordResetToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashPasswordResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export function getPasswordResetExpiryDate(now: Date = new Date()): Date {
  return new Date(now.getTime() + RESET_TTL_MS);
}

export function isDevPasswordResetPreviewEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_PASSWORD_RESET_PREVIEW !== 'false';
}
