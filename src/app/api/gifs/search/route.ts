import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';

const querySchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  limit: z.coerce.number().int().min(1).max(40).optional().default(20),
});

interface TenorMediaFormat {
  url?: string;
  dims?: number[];
}

interface TenorResult {
  id?: string;
  content_description?: string;
  media_formats?: {
    gif?: TenorMediaFormat;
    tinygif?: TenorMediaFormat;
    nanogif?: TenorMediaFormat;
  };
}

interface TenorResponse {
  results?: TenorResult[];
}

interface GifSearchResult {
  id: string;
  url: string;
  previewUrl: string;
  title: string;
  width: number;
  height: number;
}

function normalizeResult(result: TenorResult): GifSearchResult | null {
  const gif = result.media_formats?.gif;
  const tiny = result.media_formats?.tinygif;
  const nano = result.media_formats?.nanogif;

  const source = gif?.url || tiny?.url || nano?.url;
  if (!source || !result.id) return null;

  const preview = tiny?.url || nano?.url || source;
  const dims = gif?.dims || tiny?.dims || nano?.dims || [];
  const width = typeof dims[0] === 'number' ? dims[0] : 0;
  const height = typeof dims[1] === 'number' ? dims[1] : 0;

  return {
    id: result.id,
    url: source,
    previewUrl: preview,
    title: result.content_description || 'GIF',
    width,
    height,
  };
}

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    q: request.nextUrl.searchParams.get('q') || '',
    limit: request.nextUrl.searchParams.get('limit') || '20',
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query params' }, { status: 400 });
  }

  const forwarded = request.headers.get('x-forwarded-for');
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';
  const limitResult = rateLimit(`gif-search:${ip}`, {
    maxRequests: 60,
    windowMs: 60 * 1000,
  });
  if (!limitResult.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const apiKey = process.env.TENOR_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'TENOR_API_KEY is not configured', results: [] },
      { status: 503 },
    );
  }

  const { q, limit } = parsed.data;
  const endpoint = q ? 'search' : 'featured';
  const params = new URLSearchParams({
    key: apiKey,
    client_key: 'presidium',
    limit: String(limit),
    media_filter: 'gif,tinygif,nanogif',
    contentfilter: 'high',
  });
  if (q) {
    params.set('q', q);
  }

  try {
    const response = await fetch(`https://tenor.googleapis.com/v2/${endpoint}?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch GIFs', results: [] }, { status: 502 });
    }

    const data = (await response.json()) as TenorResponse;
    const results = (data.results || [])
      .map(normalizeResult)
      .filter((item): item is GifSearchResult => Boolean(item));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch GIFs', results: [] }, { status: 502 });
  }
}

