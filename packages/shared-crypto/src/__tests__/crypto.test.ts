/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */

import { describe, it, expect } from 'vitest';
import { PresidiumCrypto, GuardianCrypto } from '../index.js';

describe('PresidiumCrypto', () => {
  describe('generateKeyPair', () => {
    it('should generate valid keypair', () => {
      const pair = PresidiumCrypto.generateKeyPair();
      expect(pair.publicKey).toBeTruthy();
      expect(pair.secretKey).toBeTruthy();
      expect(pair.publicKey).toHaveLength(44); // base64 of 32 bytes
      expect(pair.secretKey).toHaveLength(44);
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt messages', () => {
      const alice = PresidiumCrypto.generateKeyPair();
      const bob = PresidiumCrypto.generateKeyPair();

      const message = 'Hello, Bob! This is encrypted.';
      const encrypted = PresidiumCrypto.encrypt(message, bob.publicKey, alice.secretKey);
      expect(encrypted.encrypted).toBeTruthy();
      expect(encrypted.nonce).toBeTruthy();

      const decrypted = PresidiumCrypto.decrypt(
        encrypted.encrypted,
        encrypted.nonce,
        alice.publicKey,
        bob.secretKey
      );
      expect(decrypted).toBe(message);
    });

    it('should fail with wrong keys', () => {
      const alice = PresidiumCrypto.generateKeyPair();
      const bob = PresidiumCrypto.generateKeyPair();
      const eve = PresidiumCrypto.generateKeyPair();

      const encrypted = PresidiumCrypto.encrypt('secret', bob.publicKey, alice.secretKey);
      const decrypted = PresidiumCrypto.decrypt(
        encrypted.encrypted,
        encrypted.nonce,
        eve.publicKey, // wrong!
        bob.secretKey
      );
      expect(decrypted).toBeNull();
    });
  });

  describe('sign/verify', () => {
    it('should sign and verify messages', () => {
      const alice = PresidiumCrypto.generateKeyPair();
      const message = 'Important message';

      const signature = PresidiumCrypto.sign(message, alice.secretKey);
      expect(signature).toBeTruthy();

      const isValid = PresidiumCrypto.verify(message, signature, alice.publicKey);
      expect(isValid).toBe(true);
    });

    it('should reject tampered messages', () => {
      const alice = PresidiumCrypto.generateKeyPair();
      const signature = PresidiumCrypto.sign('original', alice.secretKey);

      const isValid = PresidiumCrypto.verify('tampered', signature, alice.publicKey);
      expect(isValid).toBe(false);
    });
  });

  describe('hash', () => {
    it('should produce consistent hashes', () => {
      const hash1 = PresidiumCrypto.hash('test');
      const hash2 = PresidiumCrypto.hash('test');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = PresidiumCrypto.hash('test1');
      const hash2 = PresidiumCrypto.hash('test2');
      expect(hash1).not.toBe(hash2);
    });
  });
});

describe('GuardianCrypto', () => {
  it('should encrypt and decrypt backups', () => {
    const key = PresidiumCrypto.generateSymmetricKey();
    const backupData = JSON.stringify({
      privateKey: 'secret-key-here',
      contacts: ['alice', 'bob'],
    });

    const encrypted = GuardianCrypto.encryptBackup(backupData, key);
    expect(encrypted.encryptedBlob).toBeTruthy();
    expect(encrypted.nonce).toBeTruthy();

    const decrypted = GuardianCrypto.decryptBackup(
      encrypted.encryptedBlob,
      encrypted.nonce,
      key
    );
    expect(decrypted).toBe(backupData);
  });
});
