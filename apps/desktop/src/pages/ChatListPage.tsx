/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
import React from "react";
import { Search, Plus, Shield } from "lucide-react";
import ChatListItem from "../components/ChatListItem";
import type { Chat } from "../hooks/useChats";

interface Props {
  chats: Chat[];
  activeId: string | null;
  search: string;
  onSearch: (v: string) => void;
  onSelect: (chat: Chat) => void;
  onNewChat: () => void;
  loading: boolean;
}

export default function ChatListPage({ chats, activeId, search, onSearch, onSelect, onNewChat, loading }: Props) {
  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 w-80">
      <div className="px-4 py-4 border-b border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Shield size={18} className="text-emerald-500" /> Chats
          </h2>
          <button onClick={onNewChat} className="p-2 bg-emerald-700 hover:bg-emerald-600 rounded-lg transition" title="New chat">
            <Plus size={18} className="text-white" />
          </button>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
          <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search chats..."
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-600" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {loading && <div className="text-center text-slate-500 text-sm py-8">Loading...</div>}
        {!loading && chats.length === 0 && (
          <div className="text-center text-slate-600 text-sm py-12">No conversations yet</div>
        )}
        {chats.map(chat => (
          <ChatListItem key={chat.id} chat={chat} active={chat.id === activeId} onClick={() => onSelect(chat)} />
        ))}
      </div>
    </div>
  );
}
