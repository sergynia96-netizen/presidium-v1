import { NextRequest, NextResponse } from 'next/server';
import { getRelayHttpBaseUrl } from '@/lib/relay-base-url';

export async function GET(request: NextRequest) {
  try {
    const targetUrl = `${getRelayHttpBaseUrl()}/api/books${request.nextUrl.search}`;
    const relayResponse = await fetch(targetUrl, { method: 'GET', cache: 'no-store' });
    const payload = await relayResponse.json();
    return NextResponse.json(payload, { status: relayResponse.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch books';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
