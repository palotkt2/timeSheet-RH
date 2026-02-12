import { randomBytes, createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { UserRole } from '@/types';

// ─── Configuration ──────────────────────────────────────────────

/**
 * Secret key for signing JWT tokens.
 * In production, set AUTH_SECRET environment variable.
 * Falls back to a generated random key (tokens won't survive server restarts).
 */
const AUTH_SECRET = process.env.AUTH_SECRET || randomBytes(32).toString('hex');

/** Access token lifetime: 8 hours */
const ACCESS_TOKEN_TTL = 8 * 60 * 60;

/** Refresh token lifetime: 7 days */
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;

const COOKIE_ACCESS = 'mp_token';
const COOKIE_REFRESH = 'mp_refresh';

// ─── JWT Helpers (HMAC-SHA256, no external dependencies) ─────────

export interface TokenPayload {
  sub: number; // user id
  username: string;
  name: string;
  role: UserRole;
  iat: number; // issued at (epoch seconds)
  exp: number; // expires at (epoch seconds)
  type: 'access' | 'refresh';
}

function base64url(input: string | Buffer): string {
  const b64 =
    typeof input === 'string'
      ? Buffer.from(input).toString('base64')
      : input.toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input: string): string {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64').toString('utf-8');
}

function sign(payload: object): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = base64url(
    createHmac('sha256', AUTH_SECRET).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${signature}`;
}

function verify(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, sig] = parts;
    const expected = base64url(
      createHmac('sha256', AUTH_SECRET).update(`${header}.${body}`).digest(),
    );
    if (sig !== expected) return null;

    const payload: TokenPayload = JSON.parse(base64urlDecode(body));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ─── Token Creation ──────────────────────────────────────────────

export interface UserInfo {
  id: number;
  username: string;
  name: string;
  role: UserRole;
}

export function createAccessToken(user: UserInfo): string {
  const now = Math.floor(Date.now() / 1000);
  return sign({
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL,
    type: 'access',
  });
}

export function createRefreshToken(user: UserInfo): string {
  const now = Math.floor(Date.now() / 1000);
  return sign({
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    iat: now,
    exp: now + REFRESH_TOKEN_TTL,
    type: 'refresh',
  });
}

// ─── Cookie Helpers ──────────────────────────────────────────────

/**
 * Attach access + refresh tokens as HttpOnly cookies to a response.
 */
export function setAuthCookies(
  response: NextResponse,
  user: UserInfo,
): NextResponse {
  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  response.cookies.set(COOKIE_ACCESS, accessToken, {
    httpOnly: true,
    secure: false, // set true in production with HTTPS
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_TTL,
  });

  response.cookies.set(COOKIE_REFRESH, refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_TTL,
  });

  return response;
}

/**
 * Remove auth cookies (logout).
 */
export function clearAuthCookies(response: NextResponse): NextResponse {
  response.cookies.set(COOKIE_ACCESS, '', { path: '/', maxAge: 0 });
  response.cookies.set(COOKIE_REFRESH, '', { path: '/', maxAge: 0 });
  return response;
}

// ─── Request Verification ────────────────────────────────────────

/**
 * Extract and verify the access token from a request.
 * Returns the decoded payload or null.
 */
export function getAuthUser(request: NextRequest): TokenPayload | null {
  const token = request.cookies.get(COOKIE_ACCESS)?.value;
  if (!token) return null;
  const payload = verify(token);
  if (!payload || payload.type !== 'access') return null;
  return payload;
}

/**
 * Extract and verify the refresh token from a request.
 */
export function getRefreshPayload(request: NextRequest): TokenPayload | null {
  const token = request.cookies.get(COOKIE_REFRESH)?.value;
  if (!token) return null;
  const payload = verify(token);
  if (!payload || payload.type !== 'refresh') return null;
  return payload;
}

/**
 * Middleware-style helper: returns a 401 response if the user is not
 * authenticated or does not have one of the required roles.
 * Returns null if the user is authorized (request may proceed).
 */
export function requireAuth(
  request: NextRequest,
  allowedRoles?: UserRole[],
): NextResponse | null {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'No autenticado' },
      { status: 401 },
    );
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return NextResponse.json(
      { success: false, error: 'Permisos insuficientes' },
      { status: 403 },
    );
  }
  return null; // authorized
}
