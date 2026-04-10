/**
 * Crypto utility functions
 * Shared across all crypto modules.
 */

/**
 * Convert Uint8Array to hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert hex string to Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Constant-time byte array comparison.
 * Prevents timing attacks.
 */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * Generate a cryptographically secure random UUID.
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Generate random bytes.
 */
export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Encode text to Uint8Array.
 */
export function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Decode Uint8Array to text.
 */
export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Base64 encode Uint8Array.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Base64 decode to Uint8Array.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
