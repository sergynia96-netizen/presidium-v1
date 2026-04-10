import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isMutationMethod(method: string): boolean {
  return MUTATION_METHODS.has(method.toUpperCase());
}

function isSameOrigin(url: string, expectedOrigin: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === expectedOrigin;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static assets — skip entirely
  if (
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/public')
  ) {
    return NextResponse.next();
  }

  // Auth API routes — always public
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // CSRF protection for mutating API requests.
  // We validate browser-provided origin hints and reject cross-site mutations.
  // Skip in production Docker deployments (handled by CORS + network isolation).
  if (pathname.startsWith('/api/') && isMutationMethod(req.method)) {
    // In production (Docker), origin-based CSRF is handled by network isolation.
    // Only enforce in development where we can validate origins properly.
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (isDevelopment) {
      const expectedOrigin = req.nextUrl.origin;
      const origin = req.headers.get('origin');
      const referer = req.headers.get('referer');
      const fetchSite = req.headers.get('sec-fetch-site');

      if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site') {
        return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
      }

      if (origin && !isSameOrigin(origin, expectedOrigin)) {
        return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
      }

      if (!origin && referer && !isSameOrigin(referer, expectedOrigin)) {
        return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
      }
    }
  }

  // For all other API routes, check token and add headers
  if (pathname.startsWith('/api/')) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    const requestHeaders = new Headers(req.headers);
    // Prevent client-side spoofing of trusted identity headers.
    requestHeaders.delete('x-user-id');
    requestHeaders.delete('x-user-email');

    if (token) {
      if (typeof token.id === 'string' && token.id.trim()) {
        requestHeaders.set('x-user-id', token.id);
      }
      if (typeof token.email === 'string' && token.email.trim()) {
        requestHeaders.set('x-user-email', token.email);
      }
    }

    // Allow the request through regardless — individual API routes
    // handle their own auth checks. This prevents middleware from
    // blocking the onboarding flow for unauthenticated users.
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // Web routes — always allow (app handles auth state internally)
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
