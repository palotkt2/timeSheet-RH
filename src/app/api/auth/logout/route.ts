import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth';

/**
 * POST /api/auth/logout
 * Clear auth cookies and end the session.
 */
export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: 'Sesión cerrada',
  });
  return clearAuthCookies(response);
}
