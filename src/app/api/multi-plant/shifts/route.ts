import { NextResponse } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';
import { createAdapter } from '@/services/checadorAdapters/adapterFactory';
import type { Plant } from '@/types';
import { SameAppAdapter } from '@/services/checadorAdapters/sameAppAdapter';

/**
 * Normalize shift `days` field: remove Saturday (6) and Sunday (0) from
 * shifts that should be Mon–Fri only.  Only "Guardias" and "FIN DE SEMANA"
 * shifts legitimately include weekend days.
 */
function normalizeDays(shiftName: string, daysJson: string): string {
  // Guard / weekend shifts keep their original days
  const upper = (shiftName || '').toUpperCase();
  if (upper.includes('GUARDIAS') || upper.includes('FIN DE SEMANA')) {
    return daysJson;
  }
  try {
    const arr: number[] = JSON.parse(daysJson);
    const filtered = arr.filter((d) => d !== 6 && d !== 0);
    // Only return changed value if something was actually removed
    return filtered.length !== arr.length ? JSON.stringify(filtered) : daysJson;
  } catch {
    return daysJson;
  }
}

/**
 * POST /api/multi-plant/shifts/sync
 * Syncs shift definitions and shift assignments from all active plants.
 *
 * GET /api/multi-plant/shifts
 * Returns all shift assignments (employee → shift mapping) for the UI.
 */
export async function POST() {
  try {
    const db = getMultiPlantDB();
    const plants = db
      .prepare('SELECT * FROM plants WHERE is_active = 1')
      .all() as Plant[];

    if (plants.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No hay plantas activas configuradas' },
        { status: 400 },
      );
    }

    const upsertShift = db.prepare(
      `INSERT INTO shifts (source_plant_id, remote_shift_id, name, start_time, end_time, tolerance_minutes, days, is_active, custom_hours, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT(source_plant_id, remote_shift_id) DO UPDATE SET
         name = excluded.name,
         start_time = excluded.start_time,
         end_time = excluded.end_time,
         tolerance_minutes = excluded.tolerance_minutes,
         days = excluded.days,
         is_active = excluded.is_active,
         custom_hours = excluded.custom_hours,
         synced_at = datetime('now', 'localtime')`,
    );

    const upsertAssignment = db.prepare(
      `INSERT INTO shift_assignments (employee_number, shift_id, shift_name, start_time, end_time, days, start_date, end_date, active, source_plant_id, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT(employee_number, source_plant_id) DO UPDATE SET
         shift_id = excluded.shift_id,
         shift_name = excluded.shift_name,
         start_time = excluded.start_time,
         end_time = excluded.end_time,
         days = excluded.days,
         start_date = excluded.start_date,
         end_date = excluded.end_date,
         active = excluded.active,
         synced_at = datetime('now', 'localtime')`,
    );

    let totalShifts = 0;
    let totalAssignments = 0;
    const plantResults: Array<{
      plant: string;
      shifts: number;
      assignments: number;
      error?: string;
    }> = [];

    for (const plant of plants) {
      try {
        const adapter = createAdapter(plant);
        if (!(adapter instanceof SameAppAdapter)) {
          plantResults.push({
            plant: plant.name,
            shifts: 0,
            assignments: 0,
            error: 'Adapter no soporta sincronización de turnos',
          });
          continue;
        }

        const [shifts, assignments] = await Promise.all([
          adapter.fetchShifts(),
          adapter.fetchShiftAssignments(),
        ]);

        const tx = db.transaction(() => {
          for (const s of shifts) {
            upsertShift.run(
              plant.id,
              s.id,
              s.name,
              s.start_time,
              s.end_time,
              s.tolerance_minutes || 0,
              normalizeDays(s.name, s.days),
              s.is_active ?? 1,
              s.custom_hours || '{}',
            );
          }

          for (const a of assignments) {
            upsertAssignment.run(
              a.employee_id,
              a.shift_id,
              a.shift_name,
              a.start_time,
              a.end_time,
              normalizeDays(a.shift_name, a.days),
              a.start_date,
              a.end_date,
              a.active ?? 1,
              plant.id,
            );
          }
        });
        tx();

        totalShifts += shifts.length;
        totalAssignments += assignments.length;
        plantResults.push({
          plant: plant.name,
          shifts: shifts.length,
          assignments: assignments.length,
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : 'Error desconocido';
        plantResults.push({
          plant: plant.name,
          shifts: 0,
          assignments: 0,
          error: msg,
        });
      }
    }

    // Summary counts
    const { count: totalShiftsInDB } = db
      .prepare('SELECT COUNT(*) as count FROM shifts')
      .get() as { count: number };
    const { count: totalAssignmentsInDB } = db
      .prepare('SELECT COUNT(*) as count FROM shift_assignments')
      .get() as { count: number };
    const { count: uniqueShiftNames } = db
      .prepare(
        'SELECT COUNT(DISTINCT shift_name) as count FROM shift_assignments',
      )
      .get() as { count: number };

    return NextResponse.json({
      success: true,
      message: `Sincronización completada. ${totalShifts} turnos, ${totalAssignments} asignaciones.`,
      stats: {
        plantsChecked: plants.length,
        totalShiftsSynced: totalShifts,
        totalAssignmentsSynced: totalAssignments,
        totalShiftsInDB,
        totalAssignmentsInDB,
        uniqueShiftNames,
      },
      plantResults,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error syncing shifts:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const db = getMultiPlantDB();

    // Return all shift assignments grouped for the UI
    const assignments = db
      .prepare(
        `SELECT sa.employee_number, sa.shift_name, sa.start_time, sa.end_time, sa.days,
                p.name as plant_name
         FROM shift_assignments sa
         INNER JOIN plants p ON sa.source_plant_id = p.id
         WHERE sa.active = 1
         ORDER BY sa.shift_name, sa.employee_number`,
      )
      .all();

    // Also return unique shift names for filter dropdowns
    const shiftNames = db
      .prepare(
        `SELECT DISTINCT sa.shift_name, sa.start_time, sa.end_time
         FROM shift_assignments sa
         WHERE sa.active = 1
         ORDER BY sa.start_time`,
      )
      .all() as Array<{
      shift_name: string;
      start_time: string;
      end_time: string;
    }>;

    return NextResponse.json({
      success: true,
      assignments,
      shiftNames,
      total: assignments.length,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
