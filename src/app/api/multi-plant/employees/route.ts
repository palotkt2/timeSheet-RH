import { NextResponse, NextRequest } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';

interface EmployeeNameRow {
  employee_number: string;
  employee_name: string;
  employee_role: string | null;
  department: string | null;
  source_plant_id: number | null;
  updated_at: string;
}

/**
 * GET /api/multi-plant/employees
 * List all employees with their names.
 * Query params: search (filter by number or name)
 */
export async function GET(request: NextRequest) {
  try {
    const db = getMultiPlantDB();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    let query = 'SELECT * FROM employee_names';
    const params: string[] = [];

    if (search) {
      query += ' WHERE employee_number LIKE ? OR employee_name LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY employee_number ASC';

    const employees = db.prepare(query).all(...params) as EmployeeNameRow[];

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

/**
 * POST /api/multi-plant/employees
 * Create or update an employee name.
 * Body: { employee_number, employee_name, employee_role?, department? }
 */
export async function POST(request: NextRequest) {
  try {
    const db = getMultiPlantDB();
    const body = await request.json();
    const { employee_number, employee_name, employee_role, department } = body;

    if (!employee_number || !employee_name) {
      return NextResponse.json(
        {
          success: false,
          error: 'employee_number y employee_name son requeridos',
        },
        { status: 400 },
      );
    }

    db.prepare(
      `INSERT INTO employee_names (employee_number, employee_name, employee_role, department, updated_at)
       VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT(employee_number) DO UPDATE SET
         employee_name = excluded.employee_name,
         employee_role = excluded.employee_role,
         department = excluded.department,
         updated_at = datetime('now', 'localtime')`,
    ).run(
      employee_number,
      employee_name,
      employee_role || null,
      department || null,
    );

    return NextResponse.json({
      success: true,
      message: 'Empleado guardado correctamente',
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

/**
 * PUT /api/multi-plant/employees
 * Bulk upsert employee names.
 * Body: { employees: [{ employee_number, employee_name, employee_role?, department? }] }
 */
export async function PUT(request: NextRequest) {
  try {
    const db = getMultiPlantDB();
    const body = await request.json();
    const { employees } = body;

    if (!Array.isArray(employees) || employees.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Se requiere un array de empleados' },
        { status: 400 },
      );
    }

    const stmt = db.prepare(
      `INSERT INTO employee_names (employee_number, employee_name, employee_role, department, updated_at)
       VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT(employee_number) DO UPDATE SET
         employee_name = CASE WHEN excluded.employee_name != '' AND excluded.employee_name NOT LIKE 'Empleado #%' THEN excluded.employee_name ELSE employee_names.employee_name END,
         employee_role = COALESCE(excluded.employee_role, employee_names.employee_role),
         department = COALESCE(excluded.department, employee_names.department),
         updated_at = datetime('now', 'localtime')`,
    );

    const upsertMany = db.transaction(
      (
        items: Array<{
          employee_number: string;
          employee_name: string;
          employee_role?: string;
          department?: string;
        }>,
      ) => {
        let count = 0;
        for (const emp of items) {
          if (emp.employee_number) {
            stmt.run(
              emp.employee_number,
              emp.employee_name || `Empleado #${emp.employee_number}`,
              emp.employee_role || null,
              emp.department || null,
            );
            count++;
          }
        }
        return count;
      },
    );

    const count = upsertMany(employees);

    return NextResponse.json({
      success: true,
      message: `${count} empleados actualizados`,
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

/**
 * DELETE /api/multi-plant/employees
 * Delete an employee. Body: { employee_number }
 */
export async function DELETE(request: NextRequest) {
  try {
    const db = getMultiPlantDB();
    const body = await request.json();
    const { employee_number } = body;

    if (!employee_number) {
      return NextResponse.json(
        { success: false, error: 'employee_number es requerido' },
        { status: 400 },
      );
    }

    db.prepare('DELETE FROM employee_names WHERE employee_number = ?').run(
      employee_number,
    );

    return NextResponse.json({ success: true, message: 'Empleado eliminado' });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
