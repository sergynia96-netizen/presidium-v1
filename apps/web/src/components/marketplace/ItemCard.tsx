/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
'use client';

import { MapPin } from 'lucide-react';
import type { MarketplaceItem } from '@/hooks/useMarketplace';

interface Props {
  item: MarketplaceItem;
  onClick: (item: MarketplaceItem) => void;
}

export function ItemCard({ item, onClick }: Props) {
  return (
    <button
      onClick={() => onClick(item)}
      className="flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 text-left transition-colors hover:border-slate-700"
    >
      <div className="relative aspect-square bg-slate-800">
        {item.images?.[0] ? (
          <img src={item.images[0]} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-600">Нет фото</div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-slate-900/80 px-2 py-1 text-xs font-medium text-indigo-400">
          {item.category}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="mb-1 line-clamp-1 text-sm font-semibold text-white">{item.title}</h3>
        <p className="mb-2 line-clamp-2 text-xs text-slate-400">{item.description}</p>

        <div className="mt-auto flex items-center justify-between">
          <span className="text-base font-bold text-green-400">{item.price.toLocaleString()} ₽</span>
          {item.location && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <MapPin className="h-3 w-3" />
              {item.location}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
