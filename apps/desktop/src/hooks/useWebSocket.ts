/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export async function connectWebSocket(url: string, token: string) {
  await invoke("connect_ws", { url, token });
}

export async function sendWebSocketMessage(payload: unknown) {
  await invoke("send_ws_message", { payload: JSON.stringify(payload) });
}

export async function disconnectWebSocket() {
  await invoke("disconnect_ws");
}

export function onWebSocketMessage(callback: (payload: string) => void): Promise<UnlistenFn> {
  return listen<string>("ws-message", (event) => callback(event.payload));
}
