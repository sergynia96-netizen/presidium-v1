/**
 * @author Presidium Maintainer
 * @copyright (C) 2026 Presidium Maintainer. All Rights Reserved.
 */

import nacl from 'tweetnacl';
import util from 'tweetnacl-util';

export class PresidiumCrypto {
  /**
   * Generate a new X25519 keypair for E2EE
   */
  static generateKeyPair(): { publicKey: string; secretKey: string } {
    const pair = nacl.box.keyPair();
    return {
      publicKey: util.encodeBase64(pair.publicKey),
      secretKey: util.encodeBase64(pair.secretKey),
    };
  }

  /**
   * Encrypt a message using NaCl box (X25519 + XSalsa20 + Poly1305)
   */
  static encrypt(
    message: string,
    recipientPublicKey: string,
    senderSecretKey: string
  ): { encrypted: string; nonce: string } {
    const decodedMsg = util.decodeUTF8(message);
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const box = nacl.box(
      decodedMsg,
      nonce,
      util.decodeBase64(recipientPublicKey),
      util.decodeBase64(senderSecretKey)
    );
    return {
      encrypted: util.encodeBase64(box),
      nonce: util.encodeBase64(nonce),
    };
  }

  /**
   * Decrypt a message using NaCl box
   */
  static decrypt(
    encrypted: string,
    nonce: string,
    senderPublicKey: string,
    recipientSecretKey: string
  ): string | null {
    const decrypted = nacl.box.open(
      util.decodeBase64(encrypted),
      util.decodeBase64(nonce),
      util.decodeBase64(senderPublicKey),
      util.decodeBase64(recipientSecretKey)
    );
    if (!decrypted) return null;
    return util.encodeUTF8(decrypted);
  }

  /**
   * Sign a message using Ed25519
   */
  static sign(message: string, secretKey: string): string {
    const signature = nacl.sign.detached(
      util.decodeUTF8(message),
      util.decodeBase64(secretKey)
    );
    return util.encodeBase64(signature);
  }

  /**
   * Verify an Ed25519 signature
   */
  static verify(message: string, signature: string, publicKey: string): boolean {
    return nacl.sign.detached.verify(
      util.decodeUTF8(message),
      util.decodeBase64(signature),
      util.decodeBase64(publicKey)
    );
  }

  /**
   * Generate a random symmetric key for AES-GCM (used in Guardian Backup)
   */
  static generateSymmetricKey(): string {
    const key = nacl.randomBytes(32);
    return util.encodeBase64(key);
  }

  /**
   * Hash data using SHA-512 (via NaCl)
   */
  static hash(data: string): string {
    return util.encodeBase64(nacl.hash(util.decodeUTF8(data)));
  }

  /**
   * Derive a key from password using PBKDF2-like scrypt (simplified)
   * In production, use Argon2id via WASM or native module
   */
  static deriveKey(password: string, salt: string): string {
    // Simplified: hash password + salt repeatedly
    let result = password + salt;
    for (let i = 0; i < 100000; i++) {
      result = util.encodeBase64(nacl.hash(util.decodeUTF8(result)));
    }
    return result;
  }
}

/**
 * Guardian Backup encryption utilities
 */
export class GuardianCrypto {
  /**
   * Encrypt backup data with user's key
   */
  static encryptBackup(plaintext: string, userKey: string): {
    encryptedBlob: string;
    nonce: string;
  } {
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const encrypted = nacl.secretbox(
      util.decodeUTF8(plaintext),
      nonce,
      util.decodeBase64(userKey)
    );
    return {
      encryptedBlob: util.encodeBase64(encrypted),
      nonce: util.encodeBase64(nonce),
    };
  }

  /**
   * Decrypt backup data
   */
  static decryptBackup(encryptedBlob: string, nonce: string, userKey: string): string | null {
    const decrypted = nacl.secretbox.open(
      util.decodeBase64(encryptedBlob),
      util.decodeBase64(nonce),
      util.decodeBase64(userKey)
    );
    if (!decrypted) return null;
    return util.encodeUTF8(decrypted);
  }
}
