/**
 * Key Vault for encrypting private keys at rest (IndexedDB).
 *
 * Uses:
 * - PBKDF2 (SHA-256, 100k iterations) to derive a key from user password
 * - AES-256-GCM for authenticated encryption
 */

const VAULT_PASSWORD_KEY = 'presidium_vault_password';

export interface EncryptedPrivateKeyPayload {
  encrypted: number[];
  salt: number[];
  iv: number[];
}

export class KeyVault {
  private static toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return copy.buffer;
  }

  private static async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const baseKey = await crypto.subtle.importKey(
      'raw',
      this.toArrayBuffer(new TextEncoder().encode(password)),
      'PBKDF2',
      false,
      ['deriveKey'],
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: this.toArrayBuffer(salt),
        iterations: 100_000,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  static async encryptPrivateKey(
    privateKey: Uint8Array,
    password: string,
  ): Promise<EncryptedPrivateKeyPayload> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(password, salt);

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: this.toArrayBuffer(iv) },
      key,
      this.toArrayBuffer(privateKey),
    );

    return {
      encrypted: Array.from(new Uint8Array(encrypted)),
      salt: Array.from(salt),
      iv: Array.from(iv),
    };
  }

  static async decryptPrivateKey(
    encryptedData: number[],
    salt: number[],
    iv: number[],
    password: string,
  ): Promise<Uint8Array> {
    const key = await this.deriveKey(password, new Uint8Array(salt));
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: this.toArrayBuffer(new Uint8Array(iv)) },
      key,
      this.toArrayBuffer(new Uint8Array(encryptedData)),
    );
    return new Uint8Array(decrypted);
  }

  static setVaultPassword(password: string): void {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(VAULT_PASSWORD_KEY, password);
  }

  static getVaultPassword(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(VAULT_PASSWORD_KEY);
  }

  static clearVault(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(VAULT_PASSWORD_KEY);
  }
}
