import { NextResponse, NextRequest } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';
import { getDB, initDB } from '@/lib/db';
import { formatLocalDate, formatLocalDateTime } from '@/utils/dateUtils';
import { inferEntryExit } from '@/utils/scanInference';

interface EmployeeInfo {
  employee_number: string;
  employee_name: string;
  employee_role: string;
  department: string;
}

interface PunchEntry {
  employee_number: string;
  timestamp: string;
  action: string;
  plant_name: string;
}

interface Session {
  entry: string;
  exit: string;
  hoursWorked: number;
}

function calculateSessions(
  entryTimes: Date[],
  exitTimes: Date[],
): { sessions: Session[]; totalHours: number } {
  const sessions: Session[] = [];
  let totalHours = 0;
  let exitIdx = 0;

  entryTimes.sort((a, b) => a.getTime() - b.getTime());
  exitTimes.sort((a, b) => a.getTime() - b.getTime());

  for (let i = 0; i < entryTimes.length; i++) {
    const entryTime = entryTimes[i];
    while (exitIdx < exitTimes.length && exitTimes[exitIdx] <= entryTime)
      exitIdx++;

    if (exitIdx < exitTimes.length) {
      const hours =
        (exitTimes[exitIdx].getTime() - entryTime.getTime()) / (1000 * 60 * 60);
      if (hours >= 0.1 && hours <= 24) {
        sessions.push({
          entry: formatLocalDateTime(entryTime),
          exit: formatLocalDateTime(exitTimes[exitIdx]),
          hoursWorked: Math.round(hours * 100) / 100,
        });
        totalHours += hours;
        exitIdx++;
      }
    }
  }

  return { sessions, totalHours: Math.round(totalHours * 100) / 100 };
}

/**
 * GET /api/multi-plant/reports/daily?date=YYYY-MM-DD&employeeNumber=xxx
 * Returns daily attendance report from all plants for a given date.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date') || formatLocalDate(new Date());
    const employeeNumber = searchParams.get('employeeNumber');

    initDB();
    const mpDb = getMultiPlantDB();
    const mainDb = getDB();

    // Get all entries for the date from all plants
    let query = `
      SELECT pe.employee_number, pe.timestamp, pe.action, p.name as plant_name
      FROM plant_entries pe
      INNER JOIN plants p ON pe.plant_id = p.id
      WHERE date(pe.timestamp) = ?
    `;
    const params: string[] = [dateParam];

    if (employeeNumber?.trim()) {
      query += ` AND pe.employee_number = ?`;
      params.push(employeeNumber.trim());
    }
    query += ` ORDER BY pe.employee_number ASC, pe.timestamp ASC`;

    const entries = mpDb.prepare(query).all(...params) as PunchEntry[];

    // Employee info — prefer employee_names from multi_plant.db
    const employeeInfo = mpDb
      .prepare(
        `SELECT employee_number, employee_name, employee_role, department FROM employee_names`,
      )
      .all() as EmployeeInfo[];
    const mainEmpInfo = mainDb
      .prepare(
        `SELECT DISTINCT employee_number, employee_name, employee_role, department FROM employee_shifts`,
      )
      .all() as EmployeeInfo[];
    const empMap = new Map<string, EmployeeInfo>();
    mainEmpInfo.forEach((e) => empMap.set(e.employee_number, e));
    employeeInfo.forEach((e) => empMap.set(e.employee_number, e));

    // Group by employee
    const employeeEntries = new Map<string, PunchEntry[]>();
    entries.forEach((entry) => {
      if (!employeeEntries.has(entry.employee_number)) {
        employeeEntries.set(entry.employee_number, []);
      }
      employeeEntries.get(entry.employee_number)!.push(entry);
    });

    // Use shared inference module for consistent entry/exit logic
    function inferForPunches(punches: PunchEntry[]): {
      entryTimes: Date[];
      exitTimes: Date[];
    } {
      const rawScans = punches.map((p) => new Date(p.timestamp));
      const inferred = inferEntryExit(rawScans);
      return { entryTimes: inferred.entries, exitTimes: inferred.exits };
    }

    const employees: Array<Record<string, unknown>> = [];
    let totalHoursWorked = 0;
    let employeesActive = 0;

    for (const [empNum, punches] of employeeEntries) {
      const info = empMap.get(empNum);

      const { entryTimes, exitTimes } = inferForPunches(punches);
      const entryCount = entryTimes.length;
      const exitCount = exitTimes.length;

      const { sessions, totalHours } = calculateSessions(entryTimes, exitTimes);
      totalHoursWorked += totalHours;

      const plantsUsed = [...new Set(punches.map((p) => p.plant_name))];

      // Determine status
      let status: string;
      if (entryCount > exitCount) {
        status = 'En turno';
        employeesActive++;
      } else if (sessions.length > 0) {
        status = 'Completado';
      } else if (entryCount > 0 && exitCount > 0 && sessions.length === 0) {
        status = 'Registros incompletos';
      } else if (exitCount > entryCount) {
        status = 'Salidas extras';
      } else {
        status = 'Sin registros válidos';
      }

      // Calculate unpaired
      const unpairedEntries = Math.max(0, entryCount - sessions.length);
      const unpairedExits = Math.max(
        0,
        exitCount - sessions.length - (exitCount > entryCount ? 1 : 0),
      );

      const firstEntry =
        entryTimes.length > 0
          ? formatLocalDateTime(entryTimes.reduce((a, b) => (a < b ? a : b)))
          : null;
      const lastExit =
        exitTimes.length > 0
          ? formatLocalDateTime(exitTimes.reduce((a, b) => (a > b ? a : b)))
          : null;

      employees.push({
        employeeNumber: empNum,
        employeeName: info?.employee_name || `Empleado #${empNum}`,
        employeeRole: info?.employee_role || 'N/A',
        department: info?.department || 'N/A',
        firstEntry,
        lastExit,
        totalEntries: entryCount,
        totalExits: exitCount,
        validSessions: sessions.length,
        unpairedEntries,
        unpairedExits,
        totalWorkedHours: totalHours,
        status,
        plantsUsed,
        workSessions: sessions,
      });
    }

    employees.sort((a, b) =>
      (a.employeeNumber as string).localeCompare(
        b.employeeNumber as string,
        undefined,
        { numeric: true },
      ),
    );

    return NextResponse.json({
      success: true,
      date: dateParam,
      summary: {
        totalEmployees: employees.length,
        employeesPresent: employees.length,
        employeesActive,
        totalHoursWorked: Math.round(totalHoursWorked * 100) / 100,
      },
      employees,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error en reporte diario multi-planta:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Error al generar reporte diario',
        details: message,
      },
      { status: 500 },
    );
  }
}
