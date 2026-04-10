import { NextRequest, NextResponse } from 'next/server';
import { getRelayHttpBaseUrl } from '@/lib/relay-base-url';

export async function GET(request: NextRequest) {
  try {
    const relayResponse = await fetch(`${getRelayHttpBaseUrl()}/api/books/library`, {
      method: 'GET',
      headers: {
        authorization: request.headers.get('authorization') || '',
      },
      cache: 'no-store',
    });

    const payload = await relayResponse.json();
    return NextResponse.json(payload, { status: relayResponse.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch library';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
