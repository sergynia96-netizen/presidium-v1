import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

function getRelayBaseUrl(): string {
  return (
    process.env.RELAY_HTTP_URL ||
    process.env.NEXT_PUBLIC_RELAY_HTTP_URL ||
    'http://127.0.0.1:3001'
  ).replace(/\/+$/, '');
}

async function proxyRequest(
  req: NextRequest,
  params: Promise<{ path: string[] }>
): Promise<NextResponse> {
  try {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const forwarded = req.headers.get('x-forwarded-for');
      const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';
      const limit = rateLimit(`proxy:${req.method}:${ip}`, {
        maxRequests: 120,
        windowMs: 60 * 1000,
      });
      if (!limit.success) {
        return NextResponse.json(
          { error: 'Too many proxy requests. Please slow down.' },
          { status: 429 }
        );
      }
    }

    const { path } = await params;
    const relayPath = '/api/' + path.join('/');
    const targetUrl = `${getRelayBaseUrl()}${relayPath}${req.nextUrl.search}`;

    const headers = new Headers();
    req.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    const init: RequestInit = {
      method: req.method,
      headers,
      redirect: 'manual',
    };

    if (!['GET', 'HEAD'].includes(req.method)) {
      const bodyBuffer = await req.arrayBuffer();
      if (bodyBuffer.byteLength > 0) {
        init.body = bodyBuffer;
      }
    }

    const relayResponse = await fetch(targetUrl, init);
    const responseHeaders = new Headers();

    relayResponse.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    const responseBody = await relayResponse.arrayBuffer();
    return new NextResponse(responseBody, {
      status: relayResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json({ error: 'Proxy error' }, { status: 502 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, params);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, params);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, params);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, params);
}

export async function OPTIONS(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(req, params);
}
