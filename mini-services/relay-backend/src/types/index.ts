// Shared types for backend

export interface JWTPayload {
  accountId: string;
  deviceId: string;
  iat: number;
  exp: number;
}

export interface AuthRegisterBody {
  email: string;
  password: string;
  displayName: string;
  username?: string;
  publicKey: string;
  signedPreKey: string;
  oneTimePreKeys: string[];
}

export interface AuthLoginBody {
  email: string;
  password: string;
}

export interface AuthVerifyBody {
  email: string;
  code: string;
}

export interface PreKeyUploadBody {
  identityKey?: string;
  signedPreKey: string;
  signature?: string;
  oneTimePreKeys: string[];
}

export interface WsMessage {
  type: string;
  payload: Record<string, unknown>;
  from: string;
  to?: string;
  timestamp: number;
}

// WebSocket message types
export type WsMessageType =
  | 'auth'
  | 'connected'
  | 'error'
  | 'ping'
  | 'pong'
  | 'relay.envelope'
  | 'relay.ack'
  | 'relay.group_envelope'
  | 'relay.group_ack'
  | 'relay.channel_envelope'
  | 'relay.channel_ack'
  | 'relay.queue.delivered'
  | 'presence.update'
  | 'typing.start'
  | 'typing.stop'
  | 'message.deliver'
  | 'message.ack'
  | 'prekey.bundle_request'
  | 'call.offer'
  | 'call.answer'
  | 'call.ice_candidate'
  | 'call.hangup';

export interface RelayModerationFlag {
  category: string;
  severity?: 'low' | 'medium' | 'high';
  description?: string;
}

export interface RelayModerationMetadata {
  blocked: boolean;
  riskLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical';
  flags?: RelayModerationFlag[];
  source?: 'openclaw' | 'server' | 'client';
}

export interface RelayEnvelope {
  type: 'message' | 'prekey' | 'call_signal';
  from: string;
  to: string;
  content: string; // encrypted payload (server never decrypts)
  timestamp: number;
  moderation?: RelayModerationMetadata;
}
