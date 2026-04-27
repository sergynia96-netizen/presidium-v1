/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
import React, { useState, useRef } from "react";
import { Send, Paperclip, Mic, Smile, X, Reply } from "lucide-react";

interface Props {
  onSend: (text: string) => void;
  replyTo?: { id: string; name: string } | null;
  onCancelReply?: () => void;
  placeholder?: string;
}

export default function MessageInput({ onSend, replyTo, onCancelReply, placeholder }: Props) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };

  return (
    <div className="border-t border-slate-800 bg-slate-900 p-3">
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-slate-800 rounded-lg text-xs">
          <Reply className="text-emerald-500" size={14} />
          <span className="text-slate-400">Reply to <span className="text-emerald-400">{replyTo.name}</span></span>
          <button onClick={onCancelReply} className="ml-auto"><X size={14} className="text-slate-500" /></button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button className="p-2 text-slate-500 hover:text-slate-300 transition"><Paperclip size={20} /></button>
        <button className="p-2 text-slate-500 hover:text-slate-300 transition"><Smile size={20} /></button>
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSend()}
          placeholder={placeholder || "Type a message..."}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-600 transition"
        />
        {text.trim() ? (
          <button onClick={handleSend} className="p-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg transition"><Send size={20} className="text-white" /></button>
        ) : (
          <button className="p-2 text-slate-500 hover:text-slate-300 transition"><Mic size={20} /></button>
        )}
      </div>
    </div>
  );
}

