import { createHash, randomInt } from 'crypto';

const OTP_DIGITS = 6;
const OTP_MIN = 10 ** (OTP_DIGITS - 1);
const OTP_MAX = 10 ** OTP_DIGITS;

export const OTP_TTL_MS = 10 * 60 * 1000;

export function generateOtpCode(): string {
  return String(randomInt(OTP_MIN, OTP_MAX));
}

export function hashOtpCode(identifier: string, code: string): string {
  return createHash('sha256').update(`${identifier.toLowerCase()}:${code}`).digest('hex');
}

export function getOtpExpiryDate(now: Date = new Date()): Date {
  return new Date(now.getTime() + OTP_TTL_MS);
}

export function isDevOtpPreviewEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEV_OTP_PREVIEW !== 'false';
}
