/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
import { invoke } from "@tauri-apps/api/core";

export interface KeyPair {
  publicKey: string;
  signingPublicKey: string;
}

export interface EncryptedPayload {
  encrypted: string;
  nonce: string;
}

export async function generateKeys(): Promise<KeyPair> {
  return await invoke<KeyPair>("generate_keys");
}

export async function getPublicKey(): Promise<KeyPair> {
  return await invoke<KeyPair>("get_public_key");
}

export async function encryptMessage(
  message: string,
  recipientPublicKey: string,
): Promise<EncryptedPayload> {
  return await invoke<EncryptedPayload>("encrypt_message", {
    message,
    recipient_public_key: recipientPublicKey,
  });
}

export async function decryptMessage(
  encrypted: string,
  nonce: string,
  senderPublicKey: string,
): Promise<string> {
  return await invoke<string>("decrypt_message", {
    encrypted,
    nonce,
    sender_public_key: senderPublicKey,
  });
}
