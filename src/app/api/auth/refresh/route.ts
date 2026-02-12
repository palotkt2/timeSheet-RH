import { NextRequest, NextResponse } from 'next/server';
import { getRefreshPayload, setAuthCookies } from '@/lib/auth';
import { getDB } from '@/lib/db';
import type { UserRole } from '@/types';

/**
 * POST /api/auth/refresh
 * Exchange a valid refresh token for a new access + refresh token pair.
 */
export async function POST(request: NextRequest) {
  const payload = getRefreshPayload(request);

  if (!payload) {
    return NextResponse.json(
      { success: false, error: 'Sesión expirada, inicie sesión de nuevo' },
      { status: 401 },
    );
  }

  // Verify the user still exists and is active
  const db = getDB();
  const user = db
    .prepare(
      'SELECT id, username, name, role, is_active FROM users WHERE id = ?',
    )
    .get(payload.sub) as
    | {
        id: number;
        username: string;
        name: string;
        role: UserRole;
        is_active: number;
      }
    | undefined;

  if (!user || !user.is_active) {
    return NextResponse.json(
      { success: false, error: 'Cuenta desactivada o eliminada' },
      { status: 403 },
    );
  }

  // Issue new tokens
  const response = NextResponse.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    },
  });

  return setAuthCookies(response, {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
  });
}
