/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
import React from "react";
import { Lock, Reply, FileText, Image as ImageIcon } from "lucide-react";
import type { Message } from "../hooks/useMessages";

interface Props {
  message: Message;
  senderName?: string;
  onReply?: (id: string) => void;
}

export default function MessageBubble({ message, senderName, onReply }: Props) {
  const isOwn = message.isOwn;
  const showSender = !isOwn && senderName;
  return (
    <div className={lex  mb-2}>
      <div className={max-w-[75%] rounded-2xl px-4 py-2.5 }>
        {showSender && <p className="text-xs font-semibold text-emerald-400 mb-1">{senderName}</p>}
        {message.replyTo && (
          <div className="border-l-2 border-emerald-500/50 pl-2 mb-1 text-xs text-slate-400 italic">Replying to message...</div>
        )}
        {message.type === "image" ? (
          <div className="flex items-center gap-2"><ImageIcon size={16} /><span className="text-sm">Image</span></div>
        ) : message.type === "file" ? (
          <div className="flex items-center gap-2"><FileText size={16} /><span className="text-sm">File attachment</span></div>
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words">{message.decryptedText || "🔒 Encrypted"}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1">
          <Lock size={10} className="text-emerald-400/60" />
          <span className="text-[10px] text-slate-500">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          {isOwn && message.status === "delivered" && <span className="text-[10px] text-emerald-400">✓✓</span>}
          {!isOwn && onReply && (
            <button onClick={() => onReply(message.id)} className="ml-1 hover:bg-slate-700/50 rounded p-0.5"><Reply size={12} className="text-slate-500" /></button>
          )}
        </div>
      </div>
    </div>
  );
}
