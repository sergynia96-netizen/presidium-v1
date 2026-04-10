import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { load } from 'cheerio';
import { authOptions } from '@/lib/auth-options';
import { rateLimit } from '@/lib/rate-limit';

const requestSchema = z.object({
  url: z.string().url().max(2048),
});

interface LinkPreviewResponse {
  title: string;
  description: string;
  image: string;
  url: string;
}

function buildFallback(url: string): LinkPreviewResponse {
  return {
    title: '',
    description: '',
    image: '',
    url,
  };
}

function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (
    normalized === 'localhost' ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local')
  ) {
    return true;
  }

  if (
    normalized.startsWith('10.') ||
    normalized.startsWith('127.') ||
    normalized.startsWith('192.168.') ||
    normalized.startsWith('169.254.')
  ) {
    return true;
  }

  if (normalized.startsWith('172.')) {
    const secondOctet = Number(normalized.split('.')[1] || '-1');
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  return false;
}

function trimValue(value: string | undefined, max: number): string {
  if (!value) return '';
  return value.trim().slice(0, max);
}

export async function POST(request: NextRequest) {
  let sourceUrl = '';
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const forwarded = request.headers.get('x-forwarded-for');
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';
    const limit = rateLimit(`link-preview:${session.user.id}:${ip}`, {
      maxRequests: 24,
      windowMs: 60 * 1000,
    });

    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const parsedBody = requestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    sourceUrl = parsedBody.data.url;
    const target = new URL(sourceUrl);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return NextResponse.json({ error: 'Only http/https URLs are allowed' }, { status: 400 });
    }
    if (isPrivateHost(target.hostname)) {
      return NextResponse.json({ error: 'Blocked hostname' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let html = '';
    try {
      const upstream = await fetch(target.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'PresidiumLinkPreview/1.0 (+https://presidium.local)',
          Accept: 'text/html,application/xhtml+xml',
        },
        cache: 'no-store',
      });

      if (!upstream.ok) {
        return NextResponse.json(buildFallback(target.toString()), { status: 200 });
      }

      const contentType = upstream.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('text/html')) {
        return NextResponse.json(buildFallback(target.toString()), { status: 200 });
      }

      html = await upstream.text();
    } finally {
      clearTimeout(timeout);
    }

    const $ = load(html);

    const ogTitle = trimValue($('meta[property="og:title"]').attr('content'), 300);
    const ogDescription = trimValue($('meta[property="og:description"]').attr('content'), 1000);
    const ogImage = trimValue($('meta[property="og:image"]').attr('content'), 1000);

    const pageTitle = trimValue($('title').first().text(), 300);
    const metaDescription = trimValue($('meta[name="description"]').attr('content'), 1000);

    const response: LinkPreviewResponse = {
      title: ogTitle || pageTitle,
      description: ogDescription || metaDescription,
      image: ogImage,
      url: target.toString(),
    };

    return NextResponse.json(response);
  } catch {
    if (sourceUrl) {
      return NextResponse.json(buildFallback(sourceUrl), { status: 500 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
