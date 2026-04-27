/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
import React, { useEffect, useRef, useState } from "react";
import { Phone, Video, Lock, ArrowLeft } from "lucide-react";
import Avatar from "../components/Avatar";
import MessageBubble from "../components/MessageBubble";
import MessageInput from "../components/MessageInput";
import { useMessages, type Message } from "../hooks/useMessages";

interface Props {
  chatId: string | null;
  chatName: string;
  chatAvatar?: string | null;
  isEncrypted: boolean;
  myPublicKey: string;
  onBack: () => void;
}

export default function ChatViewPage({ chatId, chatName, chatAvatar, isEncrypted, myPublicKey, onBack }: Props) {
  const { messages, typingUsers, loading, sendMessage } = useMessages(chatId, myPublicKey);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  if (!chatId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-slate-900 flex items-center justify-center mb-4">
            <Lock size={32} className="text-slate-600" />
          </div>
          <p className="text-slate-500">Select a conversation to start messaging</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-950 min-w-0">
      <header className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800">
        <button onClick={onBack} className="p-1 text-slate-400 hover:text-white transition md:hidden">
          <ArrowLeft size={20} />
        </button>
        <Avatar name={chatName} src={chatAvatar} size="md" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">{chatName}</h3>
          <p className="text-xs text-slate-500 flex items-center gap-1">
            {isEncrypted && <Lock size={10} className="text-emerald-500" />}
            {typingUsers.length > 0 ? ${typingUsers.length} typing... : isEncrypted ? "End-to-end encrypted" : "Chat"}
          </p>
        </div>
        <button className="p-2 text-slate-400 hover:text-emerald-400 transition"><Phone size={18} /></button>
        <button className="p-2 text-slate-400 hover:text-emerald-400 transition"><Video size={18} /></button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && <div className="text-center text-slate-500 text-sm py-8">Loading messages...</div>}
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} senderName={msg.isOwn ? undefined : "User"} onReply={(id) => setReplyTo({ id, name: "User" })} />
        ))}
        <div ref={bottomRef} />
      </div>

      <MessageInput
        onSend={(text) => { sendMessage(text, replyTo?.id); setReplyTo(null); }}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />
    </div>
  );
}
