import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

/**
 * GET /api/auth/check
 * Returns the current authenticated user from the access token cookie.
 */
export async function GET(request: NextRequest) {
  const user = getAuthUser(request);

  if (!user) {
    return NextResponse.json(
      { success: false, error: 'No autenticado' },
      { status: 401 },
    );
  }

  return NextResponse.json({
    success: true,
    user: {
      id: user.sub,
      username: user.username,
      name: user.name,
      role: user.role,
    },
  });
}
