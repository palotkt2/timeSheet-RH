import { NextResponse } from 'next/server';
import { initDB, getDB } from '@/lib/db';

interface EmployeeRow {
  employee_number: string;
  employee_name: string | null;
  employee_role: string | null;
  department: string | null;
}

/**
 * GET /api/employee-info
 * Returns employee names/roles/departments from employee_shifts.
 * Used by the multi-plant consolidator during sync to populate employee names.
 */
export async function GET() {
  try {
    initDB();
    const db = getDB();

    const employees = db
      .prepare(
        `SELECT DISTINCT employee_number, employee_name, employee_role, department
         FROM employee_shifts
         WHERE employee_name IS NOT NULL AND employee_name != ''
         ORDER BY employee_number`,
      )
      .all() as EmployeeRow[];

    return NextResponse.json({
      success: true,
      employees,
      total: employees.length,
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
