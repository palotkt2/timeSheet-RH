import { NextResponse, NextRequest } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';
import { createAdapter } from '@/services/checadorAdapters/adapterFactory';
import type { Plant } from '@/types';

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/plants/[id]/sync
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'startDate y endDate son requeridos' },
        { status: 400 },
      );
    }

    const db = getMultiPlantDB();
    const plant = db
      .prepare('SELECT * FROM plants WHERE id = ? AND is_active = 1')
      .get(id) as Plant | undefined;
    if (!plant) {
      return NextResponse.json(
        { success: false, error: 'Planta no encontrada o inactiva' },
        { status: 404 },
      );
    }

    const adapter = createAdapter(plant);
    const entries = await adapter.fetchEntries(startDate, endDate);

    if (!entries || entries.length === 0) {
      db.prepare(
        "UPDATE plants SET last_sync = datetime('now', 'localtime') WHERE id = ?",
      ).run(id);
      return NextResponse.json({
        success: true,
        plant: plant.name,
        message: 'No se encontraron registros en el rango de fechas',
        stats: { fetched: 0, inserted: 0, duplicates: 0 },
      });
    }

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO plant_entries (plant_id, employee_number, timestamp, action, raw_data, synced_at, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `);

    let inserted = 0;
    const insertMany = db.transaction((items: typeof entries) => {
      for (const entry of items) {
        const result = insertStmt.run(
          plant.id,
          entry.employee_number,
          entry.timestamp,
          entry.action,
          entry.raw ? JSON.stringify(entry.raw) : null,
        );
        if (result.changes > 0) inserted++;
      }
    });
    insertMany(entries);

    // Auto-register new employees in employee_names table
    const uniqueEmployees = [...new Set(entries.map((e) => e.employee_number))];
    const registerStmt = db.prepare(
      `INSERT OR IGNORE INTO employee_names (employee_number, employee_name, source_plant_id, updated_at)
       VALUES (?, ?, ?, datetime('now', 'localtime'))`,
    );
    const registerMany = db.transaction((empNumbers: string[]) => {
      for (const empNum of empNumbers) {
        registerStmt.run(empNum, `Empleado #${empNum}`, plant.id);
      }
    });
    registerMany(uniqueEmployees);

    // Try to fetch real employee names from the remote plant
    let namesUpdated = 0;
    try {
      const remoteEmployees = await adapter.fetchEmployeeNames(uniqueEmployees);
      if (remoteEmployees.length > 0) {
        const nameStmt = db.prepare(
          `UPDATE employee_names SET
             employee_name = ?,
             employee_role = COALESCE(?, employee_role),
             department = COALESCE(?, department),
             updated_at = datetime('now', 'localtime')
           WHERE employee_number = ? AND employee_name LIKE 'Empleado #%'`,
        );
        const updateNames = db.transaction(() => {
          for (const emp of remoteEmployees) {
            if (emp.employee_name.startsWith('Empleado #')) continue;
            const r = nameStmt.run(
              emp.employee_name,
              emp.employee_role,
              emp.department,
              emp.employee_number,
            );
            if (r.changes > 0) namesUpdated++;
          }
        });
        updateNames();
      }
    } catch {
      // Non-critical: don't fail the sync if name fetch fails
    }

    db.prepare(
      "UPDATE plants SET last_sync = datetime('now', 'localtime') WHERE id = ?",
    ).run(id);

    return NextResponse.json({
      success: true,
      plant: plant.name,
      stats: {
        fetched: entries.length,
        inserted,
        duplicates: entries.length - inserted,
        namesUpdated,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error syncing plant:', error);
    return NextResponse.json(
      { success: false, error: `Error al sincronizar: ${message}` },
      { status: 500 },
    );
  }
}
