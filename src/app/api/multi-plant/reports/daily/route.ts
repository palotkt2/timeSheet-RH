import { NextResponse, NextRequest } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';
import { getDB, initDB } from '@/lib/db';
import {
  formatLocalDate,
  formatLocalDateTime,
  createLocalDate,
} from '@/utils/dateUtils';
import {
  inferEntryExit,
  calculateSessions,
  buildNightShiftBoundary,
  remapNightShiftDate,
} from '@/utils/scanInference';

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
  workDate: string;
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

    // Load shift assignments for night-shift detection
    const mpShifts = mpDb
      .prepare(
        `SELECT employee_number, start_time, end_time FROM shift_assignments WHERE active = 1`,
      )
      .all() as Array<{
      employee_number: string;
      start_time: string;
      end_time: string;
    }>;
    const localShifts = mainDb
      .prepare(
        `SELECT sa.employee_id as employee_number, s.start_time, s.end_time
         FROM shift_assignments sa INNER JOIN shifts s ON sa.shift_id = s.id
         WHERE sa.active = 1`,
      )
      .all() as Array<{
      employee_number: string;
      start_time: string;
      end_time: string;
    }>;
    const shiftMap = new Map<
      string,
      { start_time: string; end_time: string }
    >();
    localShifts.forEach((s) => shiftMap.set(s.employee_number, s));
    mpShifts.forEach((s) => shiftMap.set(s.employee_number, s));
    const nightShiftBoundary = buildNightShiftBoundary(shiftMap);

    // Extend query by ±1 day to capture night-shift scans that cross midnight
    const dayBefore = createLocalDate(dateParam);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayAfter = createLocalDate(dateParam);
    dayAfter.setDate(dayAfter.getDate() + 1);

    // Get all entries for the extended range from all plants
    let query = `
      SELECT pe.employee_number, pe.timestamp, pe.action, p.name as plant_name,
             date(pe.timestamp) as workDate
      FROM plant_entries pe
      INNER JOIN plants p ON pe.plant_id = p.id
      WHERE date(pe.timestamp) BETWEEN ? AND ?
    `;
    const params: string[] = [
      formatLocalDate(dayBefore),
      formatLocalDate(dayAfter),
    ];

    if (employeeNumber?.trim()) {
      query += ` AND pe.employee_number = ?`;
      params.push(employeeNumber.trim());
    }
    query += ` ORDER BY pe.employee_number ASC, pe.timestamp ASC`;

    const allEntries = mpDb.prepare(query).all(...params) as PunchEntry[];

    // Remap night-shift scans and filter to target date
    const entries: PunchEntry[] = [];
    for (const entry of allEntries) {
      const logicalDate = remapNightShiftDate(
        entry.workDate,
        entry.timestamp,
        nightShiftBoundary,
        entry.employee_number,
      );
      if (logicalDate === dateParam) {
        entries.push(entry);
      }
    }

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

      const { sessions: rawSessions, totalHours } = calculateSessions(
        entryTimes,
        exitTimes,
      );
      const sessions = rawSessions.map((s) => ({
        entry: formatLocalDateTime(s.entry),
        exit: formatLocalDateTime(s.exit),
        hoursWorked: s.hours,
      }));
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
      const unpairedExits = Math.max(0, exitCount - sessions.length);

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
