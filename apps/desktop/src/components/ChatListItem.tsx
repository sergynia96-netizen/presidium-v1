/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
import React from "react";
import { Lock } from "lucide-react";
import Avatar from "./Avatar";
import type { Chat } from "../hooks/useChats";

interface Props {
  chat: Chat;
  active?: boolean;
  onClick: () => void;
}

export default function ChatListItem({ chat, active, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={w-full flex items-center gap-3 px-3 py-3 rounded-lg transition hover:bg-slate-800/70 }
    >
      <Avatar name={chat.name || ""} src={chat.avatar} size="md" />
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-200 truncate">{chat.name || "Unnamed"}</span>
          {chat.unreadCount > 0 && (
            <span className="ml-2 bg-emerald-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{chat.unreadCount}</span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {chat.isEncrypted && <Lock size={11} className="text-emerald-500 shrink-0" />}
          <span className="text-xs text-slate-500 truncate">
            {chat.type === "direct" ? "Direct" : chat.type === "group" ? "Group" : "Channel"}
          </span>
          {chat.lastMessageAt && (
            <span className="text-xs text-slate-600 ml-auto shrink-0">
              {new Date(chat.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
