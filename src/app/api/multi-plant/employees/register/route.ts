import { NextResponse, NextRequest } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';
import { createAdapter } from '@/services/checadorAdapters/adapterFactory';
import { SameAppAdapter } from '@/services/checadorAdapters/sameAppAdapter';
import type { Plant } from '@/types';

/**
 * POST /api/multi-plant/employees/register
 *
 * Register an employee locally and push to selected remote plants (checadores).
 * Optionally assign a shift on each selected plant.
 *
 * Body: {
 *   employee_number: string,
 *   employee_name: string,
 *   employee_role?: string,
 *   department?: string,
 *   plant_ids: number[],         // which checadores to push to
 *   shift_id?: number,           // local shift id from multi_plant.db (optional)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const db = getMultiPlantDB();
    const body = await request.json();
    const {
      employee_number,
      employee_name,
      employee_role,
      department,
      plant_ids,
      shift_id,
    } = body as {
      employee_number: string;
      employee_name: string;
      employee_role?: string;
      department?: string;
      plant_ids: number[];
      shift_id?: number;
    };

    if (!employee_number?.trim() || !employee_name?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Número y nombre del empleado son requeridos',
        },
        { status: 400 },
      );
    }
    if (!Array.isArray(plant_ids) || plant_ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Debe seleccionar al menos un checador' },
        { status: 400 },
      );
    }

    // 1. Save/update in local employee_names table
    db.prepare(
      `INSERT INTO employee_names (employee_number, employee_name, employee_role, department, updated_at)
       VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT(employee_number) DO UPDATE SET
         employee_name = excluded.employee_name,
         employee_role = excluded.employee_role,
         department = excluded.department,
         updated_at = datetime('now', 'localtime')`,
    ).run(
      employee_number.trim(),
      employee_name.trim(),
      employee_role?.trim() || null,
      department?.trim() || null,
    );

    // 2. Resolve shift info if shift_id provided
    let shiftInfo: {
      remote_shift_id: number;
      source_plant_id: number;
      name: string;
    } | null = null;
    const shiftPlantMap = new Map<number, number>(); // plant_id → remote_shift_id

    if (shift_id) {
      // The local shifts table stores remote shift IDs per plant
      const shifts = db
        .prepare(
          `SELECT source_plant_id, remote_shift_id, name FROM shifts WHERE id = ?`,
        )
        .get(shift_id) as
        | {
            source_plant_id: number;
            remote_shift_id: number;
            name: string;
          }
        | undefined;

      if (shifts) {
        shiftInfo = shifts;
        // Find equivalent shift on each selected plant by name
        const allShifts = db
          .prepare(
            `SELECT id, source_plant_id, remote_shift_id, name FROM shifts WHERE is_active = 1`,
          )
          .all() as Array<{
          id: number;
          source_plant_id: number;
          remote_shift_id: number;
          name: string;
        }>;

        for (const plantId of plant_ids) {
          // First try exact match by name for that plant
          const match = allShifts.find(
            (s) => s.source_plant_id === plantId && s.name === shiftInfo!.name,
          );
          if (match) {
            shiftPlantMap.set(plantId, match.remote_shift_id);
          }
        }
      }
    }

    // 3. Push to each selected plant
    const plants = db
      .prepare('SELECT * FROM plants WHERE is_active = 1')
      .all() as Plant[];
    const plantMap = new Map(plants.map((p) => [p.id, p]));

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const results: Array<{
      plant_id: number;
      plant_name: string;
      registered: boolean;
      shiftAssigned: boolean;
      error?: string;
    }> = [];

    for (const plantId of plant_ids) {
      const plant = plantMap.get(plantId);
      if (!plant) {
        results.push({
          plant_id: plantId,
          plant_name: 'Desconocida',
          registered: false,
          shiftAssigned: false,
          error: 'Planta no encontrada',
        });
        continue;
      }

      const adapter = createAdapter(plant);
      if (!(adapter instanceof SameAppAdapter)) {
        results.push({
          plant_id: plantId,
          plant_name: plant.name,
          registered: false,
          shiftAssigned: false,
          error: 'Adapter no soporta registro de empleados',
        });
        continue;
      }

      // Register employee on remote plant
      const regResult = await adapter.registerEmployee({
        employee_number: employee_number.trim(),
        employee_name: employee_name.trim(),
        employee_role: employee_role?.trim() || 'employee',
        department: department?.trim() || '',
        date: dateStr,
      });

      if (!regResult.success) {
        results.push({
          plant_id: plantId,
          plant_name: plant.name,
          registered: false,
          shiftAssigned: false,
          error: regResult.message,
        });
        continue;
      }

      // Assign shift if applicable
      let shiftAssigned = false;
      const remoteShiftId = shiftPlantMap.get(plantId);
      if (remoteShiftId) {
        const assignResult = await adapter.assignShift({
          employee_id: employee_number.trim(),
          shift_id: remoteShiftId,
          start_date: dateStr,
        });
        shiftAssigned = assignResult.success;
        if (!assignResult.success) {
          results.push({
            plant_id: plantId,
            plant_name: plant.name,
            registered: true,
            shiftAssigned: false,
            error: `Registrado pero error al asignar turno: ${assignResult.message}`,
          });
          continue;
        }
      }

      results.push({
        plant_id: plantId,
        plant_name: plant.name,
        registered: true,
        shiftAssigned,
      });
    }

    // 4. Also save shift assignment locally if shift_id provided
    if (shift_id && shiftInfo) {
      for (const plantId of plant_ids) {
        const remoteShiftId = shiftPlantMap.get(plantId);
        if (remoteShiftId) {
          const matchShift = db
            .prepare(
              `SELECT name, start_time, end_time, days FROM shifts WHERE source_plant_id = ? AND remote_shift_id = ?`,
            )
            .get(plantId, remoteShiftId) as
            | {
                name: string;
                start_time: string;
                end_time: string;
                days: string;
              }
            | undefined;

          if (matchShift) {
            db.prepare(
              `INSERT INTO shift_assignments (employee_number, shift_id, shift_name, start_time, end_time, days, start_date, active, source_plant_id, synced_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now', 'localtime'))
               ON CONFLICT(employee_number, source_plant_id) DO UPDATE SET
                 shift_id = excluded.shift_id,
                 shift_name = excluded.shift_name,
                 start_time = excluded.start_time,
                 end_time = excluded.end_time,
                 days = excluded.days,
                 start_date = excluded.start_date,
                 active = 1,
                 synced_at = datetime('now', 'localtime')`,
            ).run(
              employee_number.trim(),
              remoteShiftId,
              matchShift.name,
              matchShift.start_time,
              matchShift.end_time,
              matchShift.days,
              dateStr,
              plantId,
            );
          }
        }
      }
    }

    const successCount = results.filter((r) => r.registered).length;
    const shiftCount = results.filter((r) => r.shiftAssigned).length;

    return NextResponse.json({
      success: successCount > 0,
      message:
        `Empleado registrado en ${successCount}/${plant_ids.length} checador(es)` +
        (shiftInfo ? `. Turno asignado en ${shiftCount} checador(es).` : ''),
      results,
      employee: {
        employee_number: employee_number.trim(),
        employee_name: employee_name.trim(),
        employee_role: employee_role?.trim() || 'employee',
        department: department?.trim() || null,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error registering employee:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
