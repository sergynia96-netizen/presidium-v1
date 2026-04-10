import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      error: 'WebSocket endpoint moved to relay backend',
      hint: 'Use NEXT_PUBLIC_RELAY_WS_URL (default: ws://localhost:3001/ws)',
    },
    { status: 426 }
  );
}
