import { NextResponse } from 'next/server';
import { getRelayHttpBaseUrl } from '@/lib/relay-base-url';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const relayResponse = await fetch(`${getRelayHttpBaseUrl()}/api/books/${id}`, {
      method: 'GET',
      cache: 'no-store',
    });
    const payload = await relayResponse.json();
    return NextResponse.json(payload, { status: relayResponse.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch book';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
