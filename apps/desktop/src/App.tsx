/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
import { useEffect, useState } from "react";

import { decryptMessage, encryptMessage, getPublicKey, type KeyPair } from "./hooks/useCrypto";
import { connectWebSocket, onWebSocketMessage, sendWebSocketMessage } from "./hooks/useWebSocket";

interface ChatMessage {
  id: string;
  senderId: string;
  encryptedPayload: string;
  nonce: string;
  createdAt: number;
}

export default function App() {
  const [keys, setKeys] = useState<KeyPair | null>(null);
  const [status, setStatus] = useState<"init" | "ready" | "error">("init");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [recipientPk, setRecipientPk] = useState("");
  const [decryptedPreview, setDecryptedPreview] = useState<Record<string, string>>({});

  useEffect(() => {
    let unlistenFn: UnlistenFn | null = null;

    const init = async () => {
      try {
        const kp = await getPublicKey();
        setKeys(kp);

        const token = localStorage.getItem("presidium_token") || "";
        await connectWebSocket("ws://localhost:3001", token);

        const unlisten = await onWebSocketMessage((payload) => {
          try {
            const msg = JSON.parse(payload) as { type?: string; payload?: ChatMessage };
            if (msg.type === "chat.message" && msg.payload) {
              setMessages((prev) => [msg.payload as ChatMessage, ...prev]);
            }
          } catch (e) {
            console.error("Invalid WS payload", e);
          }
        });

        unlistenFn = unlisten;
        setStatus("ready");
      } catch (e) {
        console.error("Init failed:", e);
        setStatus("error");
      }
    };

    void init();
    return () => {
      if (unlistenFn) {
        void unlistenFn();
      }
    };
  }, []);

  const handleSend = async () => {
    if (!input || !recipientPk || !keys) return;

    const encrypted = await encryptMessage(input, recipientPk);
    await sendWebSocketMessage({
      type: "chat.message",
      payload: {
        id: crypto.randomUUID(),
        chatId: "default",
        senderId: keys.publicKey,
        encryptedPayload: encrypted.encrypted,
        nonce: encrypted.nonce,
        type: "text",
        createdAt: Date.now(),
      },
    });

    setInput("");
  };

  const handleDecrypt = async (msg: ChatMessage) => {
    try {
      const plaintext = await decryptMessage(msg.encryptedPayload, msg.nonce, msg.senderId);
      setDecryptedPreview((prev) => ({ ...prev, [msg.id]: plaintext }));
    } catch (e) {
      console.error("Decryption failed", e);
    }
  };

  if (status === "init") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-emerald-400 text-xl font-mono animate-pulse">
          Initializing secure vault...
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-rose-500 text-xl">Cryptographic initialization failed</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-lg font-bold tracking-wide">PRESIDIUM DESKTOP</h1>
        </div>
        <div className="font-mono text-xs text-slate-500 truncate max-w-[240px]">
          {keys?.publicKey.slice(0, 32)}...
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-80 bg-slate-900 border-r border-slate-800 p-4 flex flex-col">
          <h2 className="text-xs font-bold text-slate-500 uppercase mb-3">Security</h2>
          <div className="bg-slate-800 rounded-lg p-3 mb-4">
            <p className="text-xs text-emerald-400 font-mono mb-1">E2EE Active</p>
            <p className="text-xs text-slate-400">Keys stored in OS Keychain</p>
          </div>

          <h2 className="text-xs font-bold text-slate-500 uppercase mb-3">Recipient Key</h2>
          <textarea
            value={recipientPk}
            onChange={(e) => setRecipientPk(e.target.value)}
            placeholder="Paste X25519 public key..."
            className="w-full h-24 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs font-mono text-emerald-400 resize-none focus:outline-none focus:border-emerald-600"
          />
        </aside>

        <section className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            {messages.length === 0 && (
              <div className="text-slate-600 text-center mt-20">No encrypted messages yet</div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 max-w-3xl">
                <div className="flex justify-between text-xs text-slate-500 mb-2">
                  <span className="font-mono truncate max-w-[200px]">{msg.senderId.slice(0, 24)}...</span>
                  <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                </div>

                {decryptedPreview[msg.id] ? (
                  <div className="text-slate-200 bg-slate-800/50 rounded-lg p-3 mb-2">
                    {decryptedPreview[msg.id]}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 font-mono mb-2 truncate">
                    {msg.encryptedPayload.slice(0, 64)}...
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      void handleDecrypt(msg);
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-emerald-400 px-3 py-1.5 rounded transition"
                  >
                    {decryptedPreview[msg.id] ? "Re-decrypt" : "Decrypt"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-800 p-4 bg-slate-900">
            <div className="max-w-4xl mx-auto flex gap-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleSend()}
                placeholder="Type encrypted message..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-600 transition"
              />
              <button
                onClick={() => {
                  void handleSend();
                }}
                disabled={!recipientPk}
                className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-600 text-white px-6 py-3 rounded-lg font-medium transition"
              >
                Send E2EE
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

type UnlistenFn = () => void | Promise<void>;
