import { NextRequest, NextResponse } from 'next/server';
import { getDB, hashPassword } from '@/lib/db';
import type { AppUser } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/users/:id
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const db = getDB();
    const user = db
      .prepare(
        'SELECT id, username, name, role, is_active, created_at, updated_at FROM users WHERE id = ?',
      )
      .get(Number(id)) as AppUser | undefined;

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, user });
  } catch (err) {
    console.error('GET /api/users/[id] error:', err);
    return NextResponse.json(
      { success: false, error: 'Error al obtener usuario' },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/users/:id — update user (name, role, is_active, optionally password)
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = Number(id);
    const body = await request.json();
    const { name, role, is_active, password } = body;

    const db = getDB();
    const existing = db
      .prepare('SELECT id, username FROM users WHERE id = ?')
      .get(userId) as { id: number; username: string } | undefined;
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 },
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

    // Prevent deactivating / demoting the last admin
    if ((role && role !== 'admin') || is_active === 0) {
      const adminCount = db
        .prepare(
          "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?",
        )
        .get(userId) as { count: number };
      const currentUser = db
        .prepare('SELECT role, is_active FROM users WHERE id = ?')
        .get(userId) as { role: string; is_active: number };
      if (
        currentUser.role === 'admin' &&
        currentUser.is_active === 1 &&
        adminCount.count === 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              'No se puede desactivar o cambiar el rol del único administrador activo',
          },
          { status: 400 },
        );
      }
    }

    // Build dynamic update
    const updates: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name.trim());
    }
    if (role !== undefined) {
      updates.push('role = ?');
      values.push(role);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }
    if (password) {
      const { hash, salt } = hashPassword(password);
      updates.push('password_hash = ?', 'password_salt = ?');
      values.push(hash, salt);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No hay campos para actualizar' },
        { status: 400 },
      );
    }

    updates.push("updated_at = datetime('now','localtime')");
    values.push(userId);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(
      ...values,
    );

    const user = db
      .prepare(
        'SELECT id, username, name, role, is_active, created_at, updated_at FROM users WHERE id = ?',
      )
      .get(userId) as AppUser;

    return NextResponse.json({ success: true, user });
  } catch (err) {
    console.error('PUT /api/users/[id] error:', err);
    return NextResponse.json(
      { success: false, error: 'Error al actualizar usuario' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/users/:id
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const userId = Number(id);
    const db = getDB();

    const existing = db
      .prepare('SELECT role, is_active FROM users WHERE id = ?')
      .get(userId) as { role: string; is_active: number } | undefined;
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Usuario no encontrado' },
        { status: 404 },
      );
    }

    // Prevent deleting the last admin
    if (existing.role === 'admin' && existing.is_active === 1) {
      const adminCount = db
        .prepare(
          "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1 AND id != ?",
        )
        .get(userId) as { count: number };
      if (adminCount.count === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'No se puede eliminar el único administrador activo',
          },
          { status: 400 },
        );
      }
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return NextResponse.json({ success: true, message: 'Usuario eliminado' });
  } catch (err) {
    console.error('DELETE /api/users/[id] error:', err);
    return NextResponse.json(
      { success: false, error: 'Error al eliminar usuario' },
      { status: 500 },
    );
  }
}
