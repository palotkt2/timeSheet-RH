import { NextResponse, NextRequest } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';
import { createAdapter } from '@/services/checadorAdapters/adapterFactory';
import type { Plant, AdapterEntry } from '@/types';

// POST /api/plants/sync-all
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'startDate y endDate son requeridos' },
        { status: 400 },
      );
    }

    const db = getMultiPlantDB();
    const plants = db
      .prepare('SELECT * FROM plants WHERE is_active = 1')
      .all() as Plant[];

    if (plants.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No hay plantas activas para sincronizar',
        results: [],
      });
    }

    interface SyncResult {
      plantId: number;
      plantName: string;
      success: boolean;
      stats?: { fetched: number; inserted: number; duplicates: number };
      error?: string;
    }

    const results: SyncResult[] = [];

    for (const plant of plants) {
      try {
        const adapter = createAdapter(plant);
        const entries = await adapter.fetchEntries(startDate, endDate);

        let inserted = 0;
        if (entries && entries.length > 0) {
          const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO plant_entries (plant_id, employee_number, timestamp, action, raw_data, synced_at, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
          `);

          const insertMany = db.transaction((items: AdapterEntry[]) => {
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
        }

        db.prepare(
          "UPDATE plants SET last_sync = datetime('now', 'localtime') WHERE id = ?",
        ).run(plant.id);

        results.push({
          plantId: plant.id,
          plantName: plant.name,
          success: true,
          stats: {
            fetched: entries?.length || 0,
            inserted,
            duplicates: (entries?.length || 0) - inserted,
          },
        });
      } catch (plantError: unknown) {
        const message =
          plantError instanceof Error
            ? plantError.message
            : 'Error desconocido';
        results.push({
          plantId: plant.id,
          plantName: plant.name,
          success: false,
          error: message,
        });
      }
    }

    const totalInserted = results.reduce(
      (sum, r) => sum + (r.stats?.inserted || 0),
      0,
    );
    const totalFetched = results.reduce(
      (sum, r) => sum + (r.stats?.fetched || 0),
      0,
    );
    const failedPlants = results.filter((r) => !r.success);

    return NextResponse.json({
      success: true,
      message: `Sincronización completada: ${totalInserted} nuevos de ${totalFetched} registros obtenidos`,
      summary: {
        plantsTotal: plants.length,
        plantsSuccess: plants.length - failedPlants.length,
        plantsFailed: failedPlants.length,
        totalFetched,
        totalInserted,
      },
      results,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error in sync-all:', error);
    return NextResponse.json(
      { success: false, error: `Error al sincronizar: ${message}` },
      { status: 500 },
    );
  }
}
