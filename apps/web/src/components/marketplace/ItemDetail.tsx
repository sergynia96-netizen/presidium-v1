/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
'use client';

import { ArrowLeft, MapPin, MessageCircle } from 'lucide-react';
import type { MarketplaceItem } from '@/hooks/useMarketplace';

interface Props {
  item: MarketplaceItem;
  onBack: () => void;
}

export function ItemDetail({ item, onBack }: Props) {
  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-2 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Назад
      </button>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-xl bg-slate-800">
          {item.images?.[0] ? (
            <img src={item.images[0]} alt={item.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-600">Нет фото</div>
          )}
        </div>

        <div>
          <span className="mb-2 inline-block rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-indigo-400">
            {item.category}
          </span>
          <h2 className="mb-2 text-2xl font-bold text-white">{item.title}</h2>
          <p className="mb-4 text-sm text-slate-300">{item.description}</p>

          <p className="mb-1 text-3xl font-bold text-green-400">{item.price.toLocaleString()} ₽</p>

          {item.location && (
            <p className="mb-4 flex items-center gap-1 text-sm text-slate-500">
              <MapPin className="h-4 w-4" /> {item.location}
            </p>
          )}

          <div className="mb-4 flex items-center gap-3 rounded-lg bg-slate-800/50 p-3">
            <div className="h-10 w-10 rounded-full bg-slate-700" />
            <div>
              <p className="text-sm font-medium text-white">{item.sellerName}</p>
              <p className="text-xs text-slate-500">Продавец</p>
            </div>
          </div>

          <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500">
            <MessageCircle className="h-4 w-4" /> Написать продавцу
          </button>
        </div>
      </div>
    </div>
  );
}
