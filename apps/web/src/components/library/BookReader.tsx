/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
'use client';

import { ArrowLeft, Download } from 'lucide-react';
import type { Book } from '@/hooks/useLibrary';
import { useDownloadBook } from '@/hooks/useLibrary';

interface Props {
  book: Book;
  onBack: () => void;
}

export function BookReader({ book, onBack }: Props) {
  const download = useDownloadBook();

  const handleDownload = () => {
    download.mutate(book.id);
  };

  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-2 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Назад к библиотеке
      </button>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-6 flex gap-6">
          <div className="h-48 w-36 flex-shrink-0 overflow-hidden rounded-lg bg-slate-800">
            {book.coverUrl ? (
              <img src={book.coverUrl} alt={book.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-600">PDF</div>
            )}
          </div>
          <div>
            <h2 className="mb-1 text-2xl font-bold text-white">{book.title}</h2>
            <p className="mb-2 text-sm text-slate-400">{book.author}</p>
            <p className="mb-4 text-sm text-slate-300">{book.description}</p>

            <div className="flex items-center gap-4">
              <button
                onClick={handleDownload}
                disabled={download.isPending}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {download.isPending ? 'Загрузка...' : 'Скачать'}
              </button>
              {book.price > 0 && <span className="text-lg font-bold text-green-400">{book.price} ₽</span>}
            </div>
          </div>
        </div>

        {/* PDF Reader Placeholder */}
        <div className="flex h-96 items-center justify-center rounded-lg border-2 border-dashed border-slate-700 bg-slate-800/50">
          <div className="text-center">
            <p className="mb-1 text-sm text-slate-500">PDF Reader</p>
            <p className="text-xs text-slate-600">Предпросмотр документа будет здесь</p>
          </div>
        </div>
      </div>
    </div>
  );
}
