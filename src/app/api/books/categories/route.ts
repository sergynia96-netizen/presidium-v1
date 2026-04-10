import { NextResponse } from 'next/server';
import { getRelayHttpBaseUrl } from '@/lib/relay-base-url';

export async function GET() {
  try {
    const relayResponse = await fetch(`${getRelayHttpBaseUrl()}/api/books/categories`, {
      method: 'GET',
      cache: 'no-store',
    });
    const payload = await relayResponse.json();
    return NextResponse.json(payload, { status: relayResponse.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch categories';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
