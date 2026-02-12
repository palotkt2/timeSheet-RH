import { NextRequest, NextResponse } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';

/**
 * GET /api/multi-plant/shift-assignments
 * Returns all employees with their current shift assignment (manual or synced).
 * Also returns the list of available shifts for the dropdown.
 */
export async function GET() {
  try {
    const db = getMultiPlantDB();

    // All employees from employee_names
    const employees = db
      .prepare(
        `SELECT en.employee_number, en.employee_name, en.employee_role, en.department
         FROM employee_names en
         ORDER BY en.employee_number`,
      )
      .all() as Array<{
      employee_number: string;
      employee_name: string;
      employee_role: string | null;
      department: string | null;
    }>;

    // All shift assignments (including both synced and manual)
    const assignments = db
      .prepare(
        `SELECT sa.id, sa.employee_number, sa.shift_id, sa.shift_name,
                sa.start_time, sa.end_time, sa.days, sa.is_manual,
                sa.source_plant_id, p.name as plant_name
         FROM shift_assignments sa
         LEFT JOIN plants p ON sa.source_plant_id = p.id
         WHERE sa.active = 1
         ORDER BY sa.employee_number, sa.is_manual DESC`,
      )
      .all() as Array<{
      id: number;
      employee_number: string;
      shift_id: number;
      shift_name: string;
      start_time: string;
      end_time: string;
      days: string;
      is_manual: number;
      source_plant_id: number;
      plant_name: string | null;
    }>;

    // Available shifts (unique shift definitions)
    const shifts = db
      .prepare(
        `SELECT DISTINCT s.remote_shift_id, s.name, s.start_time, s.end_time,
                s.tolerance_minutes, s.days, s.custom_hours, s.source_plant_id
         FROM shifts s
         WHERE s.is_active = 1
         ORDER BY s.start_time, s.name`,
      )
      .all() as Array<{
      remote_shift_id: number;
      name: string;
      start_time: string;
      end_time: string;
      tolerance_minutes: number;
      days: string;
      custom_hours: string;
      source_plant_id: number;
    }>;

    // Deduplicate shifts by name (same shift may exist across plants)
    const uniqueShifts: Array<{
      id: number;
      name: string;
      start_time: string;
      end_time: string;
      tolerance_minutes: number;
      days: string;
      custom_hours: string;
      source_plant_id: number;
    }> = [];
    const seenShiftNames = new Set<string>();
    for (const s of shifts) {
      const key = `${s.name}|${s.start_time}|${s.end_time}`;
      if (!seenShiftNames.has(key)) {
        seenShiftNames.add(key);
        uniqueShifts.push({
          id: s.remote_shift_id,
          name: s.name,
          start_time: s.start_time,
          end_time: s.end_time,
          tolerance_minutes: s.tolerance_minutes,
          days: s.days,
          custom_hours: s.custom_hours,
          source_plant_id: s.source_plant_id,
        });
      }
    }

    // Build a map: employee_number → effective assignment (manual wins)
    const effectiveMap = new Map<
      string,
      {
        shift_name: string;
        start_time: string;
        end_time: string;
        days: string;
        is_manual: number;
        plant_name: string | null;
        source_plant_id: number;
        shift_id: number;
        all_assignments: typeof assignments;
      }
    >();

    for (const a of assignments) {
      const existing = effectiveMap.get(a.employee_number);
      if (!existing) {
        effectiveMap.set(a.employee_number, {
          shift_name: a.shift_name,
          start_time: a.start_time,
          end_time: a.end_time,
          days: a.days,
          is_manual: a.is_manual,
          plant_name: a.plant_name,
          source_plant_id: a.source_plant_id,
          shift_id: a.shift_id,
          all_assignments: [a],
        });
      } else {
        existing.all_assignments.push(a);
        // Manual always wins
        if (a.is_manual && !existing.is_manual) {
          existing.shift_name = a.shift_name;
          existing.start_time = a.start_time;
          existing.end_time = a.end_time;
          existing.days = a.days;
          existing.is_manual = a.is_manual;
          existing.plant_name = a.plant_name;
          existing.source_plant_id = a.source_plant_id;
          existing.shift_id = a.shift_id;
        }
      }
    }

    // Join employees with their effective assignment
    const result = employees.map((emp) => {
      const assignment = effectiveMap.get(emp.employee_number);
      return {
        employee_number: emp.employee_number,
        employee_name: emp.employee_name,
        employee_role: emp.employee_role,
        department: emp.department,
        shift_name: assignment?.shift_name || null,
        start_time: assignment?.start_time || null,
        end_time: assignment?.end_time || null,
        days: assignment?.days || null,
        is_manual: assignment?.is_manual || 0,
        source_plant_id: assignment?.source_plant_id || null,
        plant_name: assignment?.plant_name || null,
        shift_id: assignment?.shift_id || null,
        assignment_count: assignment?.all_assignments.length || 0,
      };
    });

    return NextResponse.json({
      success: true,
      employees: result,
      shifts: uniqueShifts,
      total: result.length,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error getting shift assignments:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/multi-plant/shift-assignments
 * Manually assign a shift to an employee (admin override).
 * Body: { employee_number, shift_name, start_time, end_time, days, shift_id, source_plant_id }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      employee_number,
      shift_name,
      start_time,
      end_time,
      days,
      shift_id,
      source_plant_id,
    } = body;

    if (!employee_number || !shift_name || !start_time || !end_time) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos' },
        { status: 400 },
      );
    }

    const db = getMultiPlantDB();

    // Deactivate all existing assignments for this employee
    db.prepare(
      `UPDATE shift_assignments SET active = 0 WHERE employee_number = ?`,
    ).run(employee_number);

    // Insert the manual assignment
    // source_plant_id = 0 means "admin-assigned" (no specific plant)
    const plantId = source_plant_id || 0;

    db.prepare(
      `INSERT INTO shift_assignments
        (employee_number, shift_id, shift_name, start_time, end_time, days,
         start_date, end_date, active, source_plant_id, is_manual, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, date('now','localtime'), NULL, 1, ?, 1, datetime('now','localtime'))
       ON CONFLICT(employee_number, source_plant_id) DO UPDATE SET
         shift_id = excluded.shift_id,
         shift_name = excluded.shift_name,
         start_time = excluded.start_time,
         end_time = excluded.end_time,
         days = excluded.days,
         active = 1,
         is_manual = 1,
         synced_at = datetime('now','localtime')`,
    ).run(
      employee_number,
      shift_id || 0,
      shift_name,
      start_time,
      end_time,
      days || '[1,2,3,4,5]',
      plantId,
    );

    return NextResponse.json({
      success: true,
      message: `Turno "${shift_name}" asignado a empleado ${employee_number}`,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error assigning shift:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/multi-plant/shift-assignments
 * Remove manual override for an employee (revert to synced assignment).
 * Body: { employee_number }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { employee_number } = body;

    if (!employee_number) {
      return NextResponse.json(
        { success: false, error: 'employee_number requerido' },
        { status: 400 },
      );
    }

    const db = getMultiPlantDB();

    // Remove manual assignment
    db.prepare(
      `DELETE FROM shift_assignments WHERE employee_number = ? AND is_manual = 1`,
    ).run(employee_number);

    // Re-activate synced assignments
    db.prepare(
      `UPDATE shift_assignments SET active = 1 WHERE employee_number = ? AND (is_manual = 0 OR is_manual IS NULL)`,
    ).run(employee_number);

    return NextResponse.json({
      success: true,
      message: `Override manual removido para empleado ${employee_number}`,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error removing shift override:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
