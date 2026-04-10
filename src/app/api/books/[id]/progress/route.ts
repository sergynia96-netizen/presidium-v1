import { NextRequest, NextResponse } from 'next/server';
import { getRelayHttpBaseUrl } from '@/lib/relay-base-url';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const relayResponse = await fetch(`${getRelayHttpBaseUrl()}/api/books/${id}/progress`, {
      method: 'GET',
      headers: {
        authorization: request.headers.get('authorization') || '',
      },
      cache: 'no-store',
    });

    const payload = await relayResponse.json();
    return NextResponse.json(payload, { status: relayResponse.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch progress';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';
    const limit = rateLimit(`books-progress:post:${ip}`, {
      maxRequests: 80,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many progress updates. Please slow down.' },
        { status: 429 }
      );
    }

    const { id } = await params;
    const rawBody = await request.text();

    const relayResponse = await fetch(`${getRelayHttpBaseUrl()}/api/books/${id}/progress`, {
      method: 'POST',
      headers: {
        authorization: request.headers.get('authorization') || '',
        'content-type': 'application/json',
      },
      body: rawBody,
      cache: 'no-store',
    });

    const payload = await relayResponse.json();
    return NextResponse.json(payload, { status: relayResponse.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update progress';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
