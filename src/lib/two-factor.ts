import { generateSecret, generateURI, verify } from 'otplib';

const TOTP_ISSUER = process.env.TWO_FACTOR_ISSUER || 'PRESIDIUM';

export function generateTwoFactorSecret(): string {
  return generateSecret();
}

export function buildTwoFactorOtpAuthUrl(email: string, secret: string): string {
  return generateURI({
    strategy: 'totp',
    issuer: TOTP_ISSUER,
    label: email,
    secret,
    period: 30,
    digits: 6,
  });
}

export async function verifyTwoFactorCode(code: string, secret: string): Promise<boolean> {
  const sanitized = code.replace(/\s+/g, '').trim();
  if (!/^\d{6}$/.test(sanitized)) return false;
  const result = await verify({
    strategy: 'totp',
    token: sanitized,
    secret,
    period: 30,
    digits: 6,
    // Accept only one past 30s step, reject future-step drift.
    // This reduces replay/future-code acceptance while preserving UX.
    epochTolerance: [30, 0],
  });
  return Boolean(result.valid);
}
