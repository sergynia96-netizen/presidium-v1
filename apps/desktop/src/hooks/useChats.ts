/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { onWebSocketMessage, connectWebSocket, disconnectWebSocket } from "./useWebSocket";

export interface Chat {
  id: string;
  name: string | null;
  type: string;
  avatar: string | null;
  lastMessageAt: number | null;
  unreadCount: number;
  isEncrypted: boolean;
  online?: boolean;
}

export function useChats(token: string | null) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const loadChats = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<Chat[]>("get_chats");
      setChats(result);
    } catch (e) {
      console.error("Failed to load chats:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    loadChats();
  }, [token, loadChats]);

  useEffect(() => {
    if (!token) return;
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        await connectWebSocket("ws://localhost:3001", token);
        unlisten = await onWebSocketMessage((payload) => {
          try {
            const msg = JSON.parse(payload);
            if (msg.type === "chat.updated" || msg.type === "chat.created" || msg.type === "chat.message") {
              loadChats();
            }
          } catch {}
        });
      } catch (e) {
        console.error("WS connect failed:", e);
      }
    })();
    return () => {
      if (unlisten) unlisten();
      disconnectWebSocket();
    };
  }, [token, loadChats]);

  const filtered = search
    ? chats.filter(c => (c.name || "").toLowerCase().includes(search.toLowerCase()))
    : chats;

  const createChat = useCallback(async (name: string, type: string = "direct") => {
    return await invoke<Chat>("create_chat", { name, chatType: type });
  }, []);

  return { chats: filtered, allChats: chats, search, setSearch, loading, createChat, reload: loadChats };
}
