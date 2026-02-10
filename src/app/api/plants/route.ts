import { NextResponse, NextRequest } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';

// GET /api/plants - List all plants
export async function GET() {
  try {
    const db = getMultiPlantDB();
    const plants = db
      .prepare(
        `
      SELECT p.*, 
        (SELECT COUNT(*) FROM plant_entries WHERE plant_id = p.id) as total_entries
      FROM plants p ORDER BY p.name ASC
    `,
      )
      .all();

    return NextResponse.json({ success: true, plants });
  } catch (error) {
    console.error('Error listing plants:', error);
    return NextResponse.json(
      { success: false, error: 'Error al listar plantas' },
      { status: 500 },
    );
  }
}

// POST /api/plants - Create a new plant
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      ip_address,
      port,
      api_base_path,
      adapter_type,
      auth_token,
      field_mapping,
      use_https,
    } = body;

    if (!name || !ip_address) {
      return NextResponse.json(
        { success: false, error: 'Nombre y dirección IP son requeridos' },
        { status: 400 },
      );
    }

    const db = getMultiPlantDB();
    const existing = db
      .prepare('SELECT id FROM plants WHERE ip_address = ? AND port = ?')
      .get(ip_address, port || 3000);
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Ya existe una planta con esa IP y puerto' },
        { status: 409 },
      );
    }

    const result = db
      .prepare(
        `
      INSERT INTO plants (name, ip_address, port, api_base_path, adapter_type, auth_token, field_mapping, use_https)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        name,
        ip_address,
        port || 3000,
        api_base_path || '/api',
        adapter_type || 'generic',
        auth_token || null,
        field_mapping
          ? typeof field_mapping === 'string'
            ? field_mapping
            : JSON.stringify(field_mapping)
          : null,
        use_https ? 1 : 0,
      );

    const plant = db
      .prepare('SELECT * FROM plants WHERE id = ?')
      .get(result.lastInsertRowid);
    return NextResponse.json({ success: true, plant }, { status: 201 });
  } catch (error) {
    console.error('Error creating plant:', error);
    return NextResponse.json(
      { success: false, error: 'Error al crear planta' },
      { status: 500 },
    );
  }
}
