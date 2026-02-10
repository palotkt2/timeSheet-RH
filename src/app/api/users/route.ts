import { NextRequest, NextResponse } from 'next/server';
import { getDB, hashPassword } from '@/lib/db';
import type { AppUser } from '@/types';

/**
 * GET /api/users — list all users (no passwords)
 */
export async function GET() {
  try {
    const db = getDB();
    const users = db
      .prepare(
        'SELECT id, username, name, role, is_active, created_at, updated_at FROM users ORDER BY id',
      )
      .all() as AppUser[];

    return NextResponse.json({ success: true, users });
  } catch (err) {
    console.error('GET /api/users error:', err);
    return NextResponse.json(
      { success: false, error: 'Error al obtener usuarios' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/users — create a new user
 */
export async function POST(request: NextRequest) {
  try {
    const { username, password, name, role } = await request.json();

    if (!username?.trim() || !password || !name?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Usuario, contraseña y nombre son requeridos',
        },
        { status: 400 },
      );
    }

    const validRoles = ['admin', 'supervisor', 'viewer'];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json(
        {
          success: false,
          error: `Rol inválido. Opciones: ${validRoles.join(', ')}`,
        },
        { status: 400 },
      );
    }

    const db = getDB();

    // Check duplicate username
    const existing = db
      .prepare('SELECT id FROM users WHERE username = ?')
      .get(username.trim());
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'El nombre de usuario ya existe' },
        { status: 409 },
      );
    }

    const { hash, salt } = hashPassword(password);
    const result = db
      .prepare(
        `INSERT INTO users (username, password_hash, password_salt, name, role)
       VALUES (?, ?, ?, ?, ?)`,
      )
      .run(username.trim(), hash, salt, name.trim(), role || 'viewer');

    const newUser = db
      .prepare(
        'SELECT id, username, name, role, is_active, created_at, updated_at FROM users WHERE id = ?',
      )
      .get(result.lastInsertRowid) as AppUser;

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (err) {
    console.error('POST /api/users error:', err);
    return NextResponse.json(
      { success: false, error: 'Error al crear usuario' },
      { status: 500 },
    );
  }
}
