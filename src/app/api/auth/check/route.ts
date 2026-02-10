import { NextResponse } from 'next/server';

/**
 * GET /api/auth/check
 * Simple authentication check endpoint
 * Returns authentication status based on localStorage (client-side)
 */
export async function GET() {
  // Since this app uses client-side localStorage authentication,
  // this endpoint just returns a success response
  // Future enhancement: Implement proper JWT/session validation
  return NextResponse.json({
    success: true,
    authenticated: true,
    message: 'OK',
  });
}
