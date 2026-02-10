import { NextResponse } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';
import { createAdapter } from '@/services/checadorAdapters/adapterFactory';
import type { Plant } from '@/types';

/**
 * POST /api/multi-plant/employees/sync-from-plants
 * Fetches employee names from all active plants and updates local employee_names table.
 * Only overwrites placeholder names — never replaces a real name with a placeholder.
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

    const upsertStmt = db.prepare(
      `INSERT INTO employee_names (employee_number, employee_name, employee_role, department, source_plant_id, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT(employee_number) DO UPDATE SET
         employee_name = CASE
           WHEN excluded.employee_name NOT LIKE 'Empleado #%'
             THEN excluded.employee_name
           ELSE employee_names.employee_name
         END,
         employee_role = COALESCE(excluded.employee_role, employee_names.employee_role),
         department = COALESCE(excluded.department, employee_names.department),
         source_plant_id = COALESCE(excluded.source_plant_id, employee_names.source_plant_id),
         updated_at = datetime('now', 'localtime')`,
    );

    let totalFetched = 0;
    let totalUpdated = 0;
    const plantResults: Array<{
      plant: string;
      fetched: number;
      updated: number;
      error?: string;
    }> = [];

    // Get employees that still have placeholder names OR are in plant_entries but missing from employee_names
    const unnamedEmployees = db
      .prepare(
        `SELECT employee_number FROM employee_names WHERE employee_name LIKE 'Empleado #%'
         UNION
         SELECT DISTINCT pe.employee_number FROM plant_entries pe
         LEFT JOIN employee_names en ON pe.employee_number = en.employee_number
         WHERE en.employee_number IS NULL`,
      )
      .all() as Array<{ employee_number: string }>;
    // Track which employees still need names — shrinks as we find them
    const stillNeeded = new Set(unnamedEmployees.map((e) => e.employee_number));

    for (const plant of plants) {
      try {
        const empNumbers = Array.from(stillNeeded);

        if (empNumbers.length === 0) {
          plantResults.push({
            plant: plant.name,
            fetched: 0,
            updated: 0,
          });
          continue;
        }

        const adapter = createAdapter(plant);
        const employees = await adapter.fetchEmployeeNames(empNumbers);

        let updated = 0;
        if (employees.length > 0) {
          const tx = db.transaction(() => {
            for (const emp of employees) {
              // Only count as updated if it's a real name
              if (
                emp.employee_name &&
                !emp.employee_name.startsWith('Empleado #')
              ) {
                const result = upsertStmt.run(
                  emp.employee_number,
                  emp.employee_name,
                  emp.employee_role,
                  emp.department,
                  plant.id,
                );
                if (result.changes > 0) {
                  updated++;
                  stillNeeded.delete(emp.employee_number);
                }
              }
            }
          });
          tx();
        }

        totalFetched += employees.length;
        totalUpdated += updated;
        plantResults.push({
          plant: plant.name,
          fetched: employees.length,
          updated,
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : 'Error desconocido';
        plantResults.push({
          plant: plant.name,
          fetched: 0,
          updated: 0,
          error: msg,
        });
      }
    }

    // Count employees that still have placeholder names or no name at all
    const { count: stillUnnamed } = db
      .prepare(
        `SELECT COUNT(*) as count FROM (
           SELECT employee_number FROM employee_names WHERE employee_name LIKE 'Empleado #%'
           UNION
           SELECT DISTINCT pe.employee_number FROM plant_entries pe
           LEFT JOIN employee_names en ON pe.employee_number = en.employee_number
           WHERE en.employee_number IS NULL
         )`,
      )
      .get() as { count: number };

    return NextResponse.json({
      success: true,
      message: `Sincronización completada. ${totalFetched} nombres obtenidos, ${totalUpdated} actualizados.`,
      stats: {
        plantsChecked: plants.length,
        totalFetched,
        totalUpdated,
        stillUnnamed,
      },
      plantResults,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error syncing employee names:', error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
