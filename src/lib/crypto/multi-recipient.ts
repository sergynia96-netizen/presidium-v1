import {
  generateSenderKey,
  groupDecrypt,
  groupEncrypt,
  type GroupEncryptedEnvelope,
  type SenderKeyDistributionMessage,
  type SenderKeyState,
} from './sender-key';

export interface MultiRecipientPacket {
  groupId: string;
  senderId: string;
  recipients: string[];
  envelope: GroupEncryptedEnvelope;
  distribution: SenderKeyDistributionMessage;
}

function normalizeRecipients(recipients: string[]): string[] {
  return Array.from(new Set(recipients.map((item) => item.trim()).filter(Boolean)));
}

/**
 * Encrypt one payload for multiple recipients using Sender Key multicast model.
 * The same encrypted envelope is delivered to each recipient, while key material
 * is distributed out-of-band via per-recipient secure sessions.
 */
export async function encryptForRecipients(options: {
  groupId: string;
  senderId: string;
  recipients: string[];
  plaintext: string;
  state?: SenderKeyState;
}): Promise<{ packet: MultiRecipientPacket; nextState: SenderKeyState }> {
  const recipients = normalizeRecipients(options.recipients).filter(
    (recipient) => recipient !== options.senderId,
  );

  if (recipients.length === 0) {
    throw new Error('At least one recipient is required for multi-recipient encryption');
  }

  const currentState =
    options.state || (await generateSenderKey(options.groupId, options.senderId));
  const { envelope, newState } = await groupEncrypt(options.plaintext, currentState);

  const packet: MultiRecipientPacket = {
    groupId: options.groupId,
    senderId: options.senderId,
    recipients,
    envelope,
    distribution: {
      groupId: currentState.groupId,
      senderId: currentState.senderId,
      chainKey: currentState.chainKey,
      publicSignatureKey: currentState.publicSignatureKey,
      iteration: currentState.iteration,
    },
  };

  return {
    packet,
    nextState: newState,
  };
}

/**
 * Decrypts a multicast packet for one recipient.
 */
export async function decryptFromRecipientPacket(options: {
  packet: MultiRecipientPacket;
  recipientState: SenderKeyState;
  recipientId: string;
}): Promise<{ plaintext: string; nextState: SenderKeyState }> {
  if (!options.packet.recipients.includes(options.recipientId)) {
    throw new Error('Recipient is not authorized for this packet');
  }

  const result = await groupDecrypt(options.packet.envelope, options.recipientState);
  return {
    plaintext: result.plaintext,
    nextState: result.newState,
  };
}
