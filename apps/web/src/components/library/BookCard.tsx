/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
'use client';

import { Star, Download } from 'lucide-react';
import type { Book } from '@/hooks/useLibrary';

interface Props {
  book: Book;
  onClick: (book: Book) => void;
}

export function BookCard({ book, onClick }: Props) {
  return (
    <button
      onClick={() => onClick(book)}
      className="flex gap-4 rounded-xl border border-slate-800 bg-slate-900 p-3 text-left transition-colors hover:border-slate-700"
    >
      <div className="h-28 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-slate-800">
        {book.coverUrl ? (
          <img src={book.coverUrl} alt={book.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-600">PDF</div>
        )}
      </div>

      <div className="flex flex-1 flex-col">
        <h3 className="mb-0.5 line-clamp-1 text-sm font-semibold text-white">{book.title}</h3>
        <p className="mb-1 text-xs text-slate-400">{book.author}</p>
        <p className="mb-2 line-clamp-2 text-xs text-slate-500">{book.description}</p>

        <div className="mt-auto flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
            <span className="text-xs font-medium text-yellow-400">{book.rating.toFixed(1)}</span>
            <span className="text-xs text-slate-600">· {book.downloads} скач.</span>
          </div>
          {book.price === 0 ? (
            <span className="text-xs font-medium text-green-400">Бесплатно</span>
          ) : (
            <span className="text-xs font-bold text-white">{book.price} ₽</span>
          )}
        </div>
      </div>
    </button>
  );
}
