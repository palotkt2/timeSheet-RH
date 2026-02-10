import { NextResponse, NextRequest } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';

/**
 * GET /api/multi-plant/employees/register/shifts?name=Turno+Matutino
 * Resolve a shift name to a local DB shift ID.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'name es requerido' },
        { status: 400 },
      );
    }

    const db = getMultiPlantDB();
    const shift = db
      .prepare(`SELECT id FROM shifts WHERE name = ? AND is_active = 1 LIMIT 1`)
      .get(name) as { id: number } | undefined;

    if (!shift) {
      return NextResponse.json(
        { success: false, error: 'Turno no encontrado' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, shift_id: shift.id });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
