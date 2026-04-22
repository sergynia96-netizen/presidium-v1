'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  urls: string[];
}

export function MediaGallery({ urls }: Props) {
  const [lightbox, setLightbox] = useState<number | null>(null);

  if (urls.length === 0) {
    return null;
  }

  const gridClass =
    urls.length === 1
      ? 'grid-cols-1'
      : urls.length === 2
      ? 'grid-cols-2'
      : 'grid-cols-3';

  return (
    <>
      <div className={`mt-3 grid ${gridClass} gap-2 overflow-hidden rounded-xl`}>
        {urls.map((url, index) => (
          <div
            key={`${url}-${index}`}
            className={`relative cursor-pointer bg-slate-800 ${
              urls.length === 1 ? 'aspect-video' : 'aspect-square'
            }`}
            onClick={() => setLightbox(index)}
          >
            {url.match(/\.(mp4|webm|mov)$/i) ? (
              <video src={url} className="h-full w-full object-cover" preload="metadata" />
            ) : (
              <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
            )}
          </div>
        ))}
      </div>

      {lightbox !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute right-4 top-4 text-white hover:text-slate-300">
            <X className="h-8 w-8" />
          </button>

          {urls[lightbox]?.match(/\.(mp4|webm|mov)$/i) ? (
            <video
              src={urls[lightbox]}
              className="max-h-[90vh] max-w-[90vw] object-contain"
              controls
              autoPlay
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <img
              src={urls[lightbox]}
              alt=""
              className="max-h-[90vh] max-w-[90vw] object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          )}
        </div>
      )}
    </>
  );
}
