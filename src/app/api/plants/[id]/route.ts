import { NextResponse, NextRequest } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/plants/[id]
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const db = getMultiPlantDB();

    const plant = db
      .prepare(
        `
      SELECT p.*,
        (SELECT COUNT(*) FROM plant_entries WHERE plant_id = p.id) as total_entries,
        (SELECT MIN(timestamp) FROM plant_entries WHERE plant_id = p.id) as earliest_entry,
        (SELECT MAX(timestamp) FROM plant_entries WHERE plant_id = p.id) as latest_entry
      FROM plants p WHERE p.id = ?
    `,
      )
      .get(id);

    if (!plant) {
      return NextResponse.json(
        { success: false, error: 'Planta no encontrada' },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, plant });
  } catch (error) {
    console.error('Error getting plant:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener planta' },
      { status: 500 },
    );
  }
}

// PUT /api/plants/[id]
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const {
      name,
      ip_address,
      port,
      api_base_path,
      adapter_type,
      auth_token,
      auth_email,
      auth_password,
      field_mapping,
      is_active,
      use_https,
    } = body;

    const db = getMultiPlantDB();
    const existing = db.prepare('SELECT * FROM plants WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Planta no encontrada' },
        { status: 404 },
      );
    }

    db.prepare(
      `
      UPDATE plants SET
        name = COALESCE(?, name), ip_address = COALESCE(?, ip_address),
        port = COALESCE(?, port), api_base_path = COALESCE(?, api_base_path),
        adapter_type = COALESCE(?, adapter_type),
        auth_token = ?, auth_email = ?, auth_password = ?, field_mapping = ?,
        use_https = COALESCE(?, use_https),
        is_active = COALESCE(?, is_active), updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `,
    ).run(
      name || null,
      ip_address || null,
      port || null,
      api_base_path || null,
      adapter_type || null,
      auth_token !== undefined ? auth_token : existing.auth_token,
      auth_email !== undefined ? auth_email || null : existing.auth_email,
      auth_password !== undefined
        ? auth_password || null
        : existing.auth_password,
      field_mapping !== undefined
        ? typeof field_mapping === 'string'
          ? field_mapping
          : JSON.stringify(field_mapping)
        : existing.field_mapping,
      use_https !== undefined ? (use_https ? 1 : 0) : null,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      id,
    );

    const updated = db.prepare('SELECT * FROM plants WHERE id = ?').get(id);
    return NextResponse.json({ success: true, plant: updated });
  } catch (error) {
    console.error('Error updating plant:', error);
    return NextResponse.json(
      { success: false, error: 'Error al actualizar planta' },
      { status: 500 },
    );
  }
}

// DELETE /api/plants/[id]
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const db = getMultiPlantDB();

    const existing = db.prepare('SELECT * FROM plants WHERE id = ?').get(id) as
      | { name: string }
      | undefined;
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Planta no encontrada' },
        { status: 404 },
      );
    }

    const deletedEntries = db
      .prepare('DELETE FROM plant_entries WHERE plant_id = ?')
      .run(id);
    db.prepare('DELETE FROM plants WHERE id = ?').run(id);

    return NextResponse.json({
      success: true,
      message: `Planta "${existing.name}" eliminada con ${deletedEntries.changes} registros`,
    });
  } catch (error) {
    console.error('Error deleting plant:', error);
    return NextResponse.json(
      { success: false, error: 'Error al eliminar planta' },
      { status: 500 },
    );
  }
}
