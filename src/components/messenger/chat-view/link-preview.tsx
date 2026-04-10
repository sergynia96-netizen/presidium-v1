/**
 * Link Preview Component
 *
 * Shows rich previews for URLs in messages.
 * Fetches Open Graph metadata and displays:
 * - Title
 * - Description
 * - Image
 * - Favicon + domain
 *
 * Architecture:
 * - Server-side OG fetching via /api/link-preview
 * - Cached previews in IndexedDB
 * - Fallback to simple URL display
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { ExternalLink, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LinkPreviewData {
  url: string;
  title: string;
  description: string;
  image?: string;
  favicon?: string;
  domain: string;
  siteName?: string;
}

interface LinkPreviewProps {
  url: string;
  className?: string;
  onClick?: () => void;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const previewCache = new Map<string, LinkPreviewData | null>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const cacheTimestamps = new Map<string, number>();

// ─── Component ───────────────────────────────────────────────────────────────

export function LinkPreview({ url, className, onClick }: LinkPreviewProps) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchPreview = useCallback(async () => {
    // Check cache
    const cached = previewCache.get(url);
    const timestamp = cacheTimestamps.get(url);

    if (cached && timestamp && Date.now() - timestamp < CACHE_TTL) {
      setPreview(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    try {
      const response = await fetch('/api/link-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch preview');
      }

      const data = (await response.json()) as {
        url?: string;
        title?: string;
        description?: string;
        image?: string;
      };

      const urlObj = new URL(url);
      const normalized: LinkPreviewData = {
        url: data.url || url,
        title: data.title || urlObj.hostname,
        description: data.description || url,
        image: data.image || undefined,
        favicon: `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`,
        domain: urlObj.hostname,
      };

      // Cache the result
      previewCache.set(url, normalized);
      cacheTimestamps.set(url, Date.now());

      setPreview(normalized);
    } catch {
      // Try fallback: extract domain from URL
      try {
        const urlObj = new URL(url);
        const fallback: LinkPreviewData = {
          url,
          title: urlObj.hostname,
          description: url,
          domain: urlObj.hostname,
        };
        previewCache.set(url, fallback);
        cacheTimestamps.set(url, Date.now());
        setPreview(fallback);
      } catch {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 p-3 rounded-lg bg-muted/50 animate-pulse', className)}>
        <div className="size-4 bg-muted rounded" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 bg-muted rounded w-3/4" />
          <div className="h-2.5 bg-muted rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn('flex items-center gap-1.5 text-xs text-blue-500 hover:underline', className)}
        onClick={onClick}
      >
        <LinkIcon className="size-3" />
        {url}
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'block overflow-hidden rounded-lg border border-border/50 bg-card hover:border-border transition-colors',
        className,
      )}
      onClick={onClick}
    >
      {/* Preview image */}
      {preview.image && (
        <div className="relative aspect-video bg-muted overflow-hidden">
          <img
            src={preview.image}
            alt={preview.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Content */}
      <div className="p-3">
        {/* Domain + favicon */}
        <div className="flex items-center gap-1.5 mb-1">
          {preview.favicon && (
            <img
              src={preview.favicon}
              alt=""
              className="size-3.5"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <span className="text-[10px] text-muted-foreground truncate">
            {preview.domain}
          </span>
          <ExternalLink className="size-2.5 text-muted-foreground ml-auto shrink-0" />
        </div>

        {/* Title */}
        <h4 className="text-sm font-medium line-clamp-2 mb-0.5">
          {preview.title}
        </h4>

        {/* Description */}
        {preview.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {preview.description}
          </p>
        )}
      </div>
    </a>
  );
}

// ─── Link Detection ──────────────────────────────────────────────────────────

/**
 * Detect URLs in text and wrap them with LinkPreview components.
 */
const URL_REGEX = /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/g;

export function detectLinks(text: string): { type: 'text' | 'url'; content: string }[] {
  const parts: { type: 'text' | 'url'; content: string }[] = [];
  let lastIndex = 0;

  const matches = text.matchAll(URL_REGEX);
  for (const match of matches) {
    if (match.index! > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'url', content: match[0] });
    lastIndex = match.index! + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts;
}
