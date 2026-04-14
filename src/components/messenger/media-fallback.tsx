/**
 * MediaFallback — graceful handling of missing/unavailable media files.
 *
 * Shows a friendly placeholder when file URL returns 404/500,
 * instead of a broken media element.
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { RefreshCw, FileQuestion, Lock } from 'lucide-react';

interface MediaFallbackProps {
  /** File ID without extension (e.g. "abc123" for "/uploads/abc123.enc") */
  fileId?: string;
  /** Explicit media URL. If provided, it has priority over fileId. */
  src?: string;
  /** Render function that receives the media URL */
  children: (url: string) => React.ReactNode;
  /** Called when the file fails to load */
  onError?: (error: Error) => void;
  /** Custom loading text */
  loadingText?: string;
  /** Custom error text */
  errorText?: string;
  /** Optional className for error fallback */
  fallbackClassName?: string;
  /** Use hidden image probe instead of HEAD check (better for images). */
  probeWithImage?: boolean;
}

export function MediaFallback({
  fileId,
  src,
  children,
  onError,
  loadingText = 'Загрузка файла...',
  errorText = '🔒 Файл недоступен',
  fallbackClassName,
  probeWithImage = true,
}: MediaFallbackProps) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const mediaUrl = src || (fileId ? `/uploads/${fileId}.enc` : '');
  const idPreview = fileId ? `${fileId.slice(0, 8)}...` : 'unknown';

  const handleError = useCallback(() => {
    setFailed(true);
    setLoading(false);
    onError?.(new Error(`Media file ${fileId || src || 'unknown'} not found`));
  }, [fileId, onError, src]);

  const handleSuccess = useCallback(() => {
    setLoading(false);
    setFailed(false);
  }, []);

  const checkAvailability = useCallback(async () => {
    if (!mediaUrl) {
      handleError();
      return;
    }

    try {
      const response = await fetch(mediaUrl, { method: 'HEAD' });
      if (!response.ok) {
        handleError();
      } else {
        handleSuccess();
      }
    } catch {
      handleError();
    }
  }, [handleError, handleSuccess, mediaUrl]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!mediaUrl) {
        handleError();
        return;
      }

      setFailed(false);
      setLoading(true);

      if (probeWithImage) {
        return;
      }

      try {
        const response = await fetch(mediaUrl, { method: 'HEAD' });
        if (cancelled) return;

        if (!response.ok) {
          handleError();
          return;
        }

        handleSuccess();
      } catch {
        if (cancelled) return;
        handleError();
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [handleError, handleSuccess, mediaUrl, probeWithImage]);

  const handleRetry = async () => {
    setRetrying(true);
    setFailed(false);
    setLoading(true);
    await checkAvailability();
    setRetrying(false);
  };

  if (failed) {
    return (
      <div className={fallbackClassName || 'flex min-h-[120px] flex-col items-center justify-center rounded-lg border border-gray-200 bg-gray-100 p-6 dark:border-gray-700 dark:bg-gray-800/50'}>
        <FileQuestion className="w-10 h-10 text-gray-400 dark:text-gray-500 mb-2" />
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300 text-center">
          {errorText}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono">
          {idPreview}
        </p>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`}
          />
          {retrying ? 'Проверка...' : 'Повторить'}
        </button>
      </div>
    );
  }

  return (
    <>
      {loading && (
        <div className="flex items-center gap-2 p-4 bg-gray-50 dark:bg-gray-800/30 rounded-lg text-sm text-gray-500 dark:text-gray-400">
          <Lock className="w-4 h-4" />
          {loadingText}
        </div>
      )}

      {/* Actual media content — hidden until loaded */}
      <div className={loading ? 'hidden' : undefined}>
        {children(mediaUrl)}
      </div>

      {mediaUrl && probeWithImage ? (
        <img
          src={mediaUrl}
          style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
          onError={handleError}
          onLoad={handleSuccess}
          alt=""
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}

/**
 * EncryptedImage — convenience wrapper for encrypted images with fallback
 * 
 * Usage:
 *   <EncryptedImage fileId="abc123" alt="Shared photo" />
 */
export function EncryptedImage({
  fileId,
  src,
  alt,
  className,
  fallbackClassName,
}: {
  fileId?: string;
  src?: string;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <MediaFallback fileId={fileId} src={src} fallbackClassName={fallbackClassName}>
      {(url) => (
        <img
          src={url}
          alt={alt || 'Encrypted image'}
          className={className}
          onError={(e) => {
            // Fallback already handled by MediaFallback
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
    </MediaFallback>
  );
}

/**
 * EncryptedVideo — convenience wrapper for encrypted videos with fallback
 * 
 * Usage:
 *   <EncryptedVideo fileId="abc123" />
 */
export function EncryptedVideo({
  fileId,
  src,
  className,
  controls = true,
}: {
  fileId?: string;
  src?: string;
  className?: string;
  controls?: boolean;
}) {
  return (
    <MediaFallback fileId={fileId} src={src} probeWithImage={false}>
      {(url) => (
        <video
          src={url}
          controls={controls}
          className={className}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
    </MediaFallback>
  );
}
