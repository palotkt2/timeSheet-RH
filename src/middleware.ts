import { NextRequest, NextResponse } from 'next/server';

// ─── Lightweight JWT check for Edge middleware ──────────────────
// Edge Runtime does NOT support Node.js `crypto`. Instead of verifying
// the HMAC signature here we only decode the payload and check expiry.
// Full cryptographic verification happens server-side in each API route
// via `requireAuth()` from lib/auth.ts (which runs on Node.js runtime).

const COOKIE_ACCESS = 'mp_token';

/**
 * Decode a base64url string (Edge-compatible, no Buffer).
 */
function base64urlDecode(input: string): string {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
}

/**
 * Quick-check the access token: decode payload, verify expiry and type.
 * Does NOT verify the signature (that's done in API routes).
 */
function isTokenValid(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(base64urlDecode(parts[1]));
    if (payload.exp < Math.floor(Date.now() / 1000)) return false;
    if (payload.type !== 'access') return false;
    return true;
  } catch {
    return false;
  }
}

// ─── Route protection ────────────────────────────────────────────

/**
 * Routes that do NOT require authentication.
 */
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/_next', '/favicon.ico'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js')
  );
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Always allow public paths and static assets
  if (isPublic(pathname) || isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_ACCESS)?.value;

  // No token → redirect pages to login, return 401 for API
  if (!token || !isTokenValid(token)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'No autenticado' },
        { status: 401 },
      );
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
