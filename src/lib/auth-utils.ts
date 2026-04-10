import bcrypt from 'bcryptjs';

function getPinPepper(): string {
  return process.env.PIN_PEPPER || process.env.NEXTAUTH_SECRET || '';
}

function applyPinPepper(pin: string): string {
  const pepper = getPinPepper();
  if (!pepper) return pin;
  return `${pin}:${pepper}`;
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Compare a password with a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Hash a PIN code
 */
export async function hashPin(pin: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(applyPinPepper(pin), saltRounds);
}

/**
 * Verify a PIN code
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(applyPinPepper(pin), hash);
}
