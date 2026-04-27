/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
import React from "react";
import { MessageCircle, BookOpen, Newspaper, ShoppingBag, Settings, Ghost, Shield } from "lucide-react";

type Page = "chats" | "stories" | "feed" | "marketplace" | "library" | "settings";

interface Props {
  current: Page;
  onNavigate: (page: Page) => void;
  unreadCount?: number;
}

const navItems: { id: Page; icon: React.ReactNode; label: string }[] = [
  { id: "chats", icon: <MessageCircle size={20} />, label: "Chats" },
  { id: "stories", icon: <BookOpen size={20} />, label: "Stories" },
  { id: "feed", icon: <Newspaper size={20} />, label: "Feed" },
  { id: "marketplace", icon: <ShoppingBag size={20} />, label: "Market" },
  { id: "library", icon: <BookOpen size={20} />, label: "Library" },
  { id: "settings", icon: <Settings size={20} />, label: "Settings" },
];

export default function Sidebar({ current, onNavigate, unreadCount = 0 }: Props) {
  return (
    <nav className="w-16 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-4 gap-1">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center mb-6">
        <Shield size={22} className="text-white" />
      </div>
      {navItems.map(item => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id)}
          className={w-11 h-11 rounded-xl flex items-center justify-center transition relative }
          title={item.label}
        >
          {item.icon}
          {item.id === "chats" && unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{unreadCount > 9 ? "9+" : unreadCount}</span>
          )}
        </button>
      ))}
      <div className="mt-auto">
        <Ghost size={20} className="text-slate-600" />
      </div>
    </nav>
  );
}

export type { Page };
