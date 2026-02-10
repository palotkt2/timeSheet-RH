import { NextResponse, NextRequest } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';

// GET /api/multi-plant/entries
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const employeeNumber = searchParams.get('employeeNumber');
    const plantId = searchParams.get('plantId');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'startDate y endDate son requeridos' },
        { status: 400 },
      );
    }

    const db = getMultiPlantDB();

    let query = `
      SELECT pe.id, pe.employee_number, pe.timestamp, pe.action, pe.plant_id,
        p.name as plant_name, pe.synced_at
      FROM plant_entries pe
      INNER JOIN plants p ON pe.plant_id = p.id
      WHERE date(pe.timestamp) BETWEEN ? AND ?
    `;
    const params: (string | number)[] = [startDate, endDate];

    if (employeeNumber) {
      query += ' AND pe.employee_number = ?';
      params.push(employeeNumber);
    }
    if (plantId) {
      query += ' AND pe.plant_id = ?';
      params.push(plantId);
    }

    query += ' ORDER BY pe.employee_number ASC, pe.timestamp ASC';
    const entries = db.prepare(query).all(...params) as Array<{
      employee_number: string;
    }>;

    const plantSummary = db
      .prepare(
        `
      SELECT p.id, p.name,
        COUNT(pe.id) as entry_count,
        COUNT(DISTINCT pe.employee_number) as unique_employees
      FROM plants p
      LEFT JOIN plant_entries pe ON p.id = pe.plant_id AND date(pe.timestamp) BETWEEN ? AND ?
      WHERE p.is_active = 1 GROUP BY p.id
    `,
      )
      .all(startDate, endDate);

    return NextResponse.json({
      success: true,
      entries,
      totalEntries: entries.length,
      uniqueEmployees: new Set(entries.map((e) => e.employee_number)).size,
      plantSummary,
    });
  } catch (error) {
    console.error('Error fetching multi-plant entries:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener registros' },
      { status: 500 },
    );
  }
}
