/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { onWebSocketMessage, sendWebSocketMessage } from "./useWebSocket";
import { encryptMessage, decryptMessage, getPublicKey, type EncryptedPayload } from "./useCrypto";

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  encryptedPayload: string;
  nonce: string;
  type: string;
  status: string;
  createdAt: number;
  replyTo?: string;
  decryptedText?: string;
  isOwn: boolean;
}

export function useMessages(chatId: string | null, myPublicKey: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const keysRef = useRef<Record<string, string>>({});

  const loadMessages = useCallback(async () => {
    if (!chatId) return;
    setLoading(true);
    try {
      const msgs = await invoke<any[]>("get_messages", { chatId, limit: 100 });
      setMessages(msgs.map((m: any) => ({
        ...m,
        isOwn: m.senderId === myPublicKey,
      })));
    } catch (e) {
      console.error("Failed to load messages:", e);
    } finally {
      setLoading(false);
    }
  }, [chatId, myPublicKey]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  useEffect(() => {
    if (!chatId) return;
    const unlisten = onWebSocketMessage(async (payload) => {
      try {
        const msg = JSON.parse(payload);
        if (msg.type === "chat.message" && msg.payload?.chatId === chatId) {
          const m = msg.payload;
          setMessages(prev => [...prev, {
            ...m,
            isOwn: m.senderId === myPublicKey,
          }].sort((a, b) => a.createdAt - b.createdAt));
          const text = await decryptMessage(m.encryptedPayload, m.nonce, m.senderId);
          setMessages(prev => prev.map(x => x.id === m.id ? { ...x, decryptedText: text } : x));
        }
        if (msg.type === "typing" && msg.payload?.chatId === chatId) {
          setTypingUsers(prev =>
            prev.includes(msg.payload.userId) ? prev : [...prev, msg.payload.userId]
          );
          setTimeout(() => setTypingUsers(prev => prev.filter(u => u !== msg.payload?.userId)), 3000);
        }
      } catch {}
    });
    return () => { unlisten.then(fn => fn()); };
  }, [chatId, myPublicKey]);

  const sendMessage = useCallback(async (text: string, replyTo?: string) => {
    if (!chatId || !text) return;
    const recipientKey = keysRef.current[chatId];
    let encrypted: EncryptedPayload;
    if (recipientKey) {
      encrypted = await encryptMessage(text, recipientKey);
    } else {
      encrypted = { encrypted: btoa(text), nonce: "" };
    }
    const id = crypto.randomUUID();
    const msg = { id, chatId, senderId: myPublicKey, encryptedPayload: encrypted.encrypted, nonce: encrypted.nonce, type: "text", status: "sent", createdAt: Date.now(), replyTo };
    await invoke("save_message", { message: msg });
    setMessages(prev => [...prev, { ...msg, decryptedText: text, isOwn: true }]);
    await sendWebSocketMessage({ type: "chat.message", payload: msg });
  }, [chatId, myPublicKey]);

  return { messages, typingUsers, loading, sendMessage, reload: loadMessages };
}
