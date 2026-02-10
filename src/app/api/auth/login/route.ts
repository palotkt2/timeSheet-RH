import { NextRequest, NextResponse } from 'next/server';
import { getDB, verifyPassword } from '@/lib/db';

/**
 * POST /api/auth/login
 * Validate credentials against the users table.
 */
export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Usuario y contraseña requeridos' },
        { status: 400 },
      );
    }

    const db = getDB();
    const user = db
      .prepare(
        'SELECT id, username, password_hash, password_salt, name, role, is_active FROM users WHERE username = ?',
      )
      .get(username) as
      | {
          id: number;
          username: string;
          password_hash: string;
          password_salt: string;
          name: string;
          role: string;
          is_active: number;
        }
      | undefined;

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario o contraseña incorrectos' },
        { status: 401 },
      );
    }

    if (!user.is_active) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cuenta desactivada. Contacte al administrador.',
        },
        { status: 403 },
      );
    }

    if (!verifyPassword(password, user.password_hash, user.password_salt)) {
      return NextResponse.json(
        { success: false, error: 'Usuario o contraseña incorrectos' },
        { status: 401 },
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 },
    );
  }
}
