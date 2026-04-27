/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
import React from "react";

interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: "sm" | "md" | "lg";
  status?: "online" | "offline" | "away";
  className?: string;
}

const sizes = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-14 h-14 text-lg" };
const statusColors = { online: "bg-emerald-500", offline: "bg-slate-500", away: "bg-amber-500" };
const statusSizes = { sm: "w-2 h-2", md: "w-3 h-3", lg: "w-4 h-4" };

export default function Avatar({ src, name, size = "md", status, className = "" }: AvatarProps) {
  const initials = (name || "?").slice(0, 2).toUpperCase();
  return (
    <div className={elative inline-flex shrink-0 }>
      {src ? (
        <img src={src} alt={name || ""} className={${sizes[size]} rounded-full object-cover bg-slate-800} />
      ) : (
        <div className={${sizes[size]} rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white font-bold}>
          {initials}
        </div>
      )}
      {status && (
        <span className={bsolute bottom-0 right-0   rounded-full border-2 border-slate-900} />
      )}
    </div>
  );
}
