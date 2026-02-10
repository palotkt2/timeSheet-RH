import { NextResponse, NextRequest } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';
import { getDB, initDB } from '@/lib/db';
import { formatLocalDate, createLocalDate } from '@/utils/dateUtils';
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
 * GET /api/multi-plant/reports/validation?date=YYYY-MM-DD
 * Validates employee hours from all plants for a given date.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date') || formatLocalDate(new Date());

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

    // Extend query by ±1 day to capture night-shift scans
    const dayBefore = createLocalDate(dateParam);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayAfter = createLocalDate(dateParam);
    dayAfter.setDate(dayAfter.getDate() + 1);

    // Get entries for extended range
    const allEntries = mpDb
      .prepare(
        `
        SELECT pe.employee_number, pe.timestamp, pe.action, p.name as plant_name,
               date(pe.timestamp) as workDate
        FROM plant_entries pe
        INNER JOIN plants p ON pe.plant_id = p.id
        WHERE date(pe.timestamp) BETWEEN ? AND ?
        ORDER BY pe.employee_number ASC, pe.timestamp ASC
      `,
      )
      .all(
        formatLocalDate(dayBefore),
        formatLocalDate(dayAfter),
      ) as PunchEntry[];

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

    const validationResults: Array<Record<string, unknown>> = [];
    let validCount = 0;
    let invalidCount = 0;

    for (const [empNum, punches] of employeeEntries) {
      const info = empMap.get(empNum);
      const plantsUsed = [...new Set(punches.map((p) => p.plant_name))];

      // Use shared inference module for consistent entry/exit logic
      const rawScans = punches.map((p) => new Date(p.timestamp));
      const inferred = inferEntryExit(rawScans);
      const entryTimes = inferred.entries;
      const exitTimes = inferred.exits;

      const entryCount = entryTimes.length;
      const exitCount = exitTimes.length;

      const issues: string[] = [];

      // Calculate hours from inferred sessions using shared calculator
      const { sessions, totalHours: rawTotalHours } = calculateSessions(
        entryTimes,
        exitTimes,
      );
      let totalHours = rawTotalHours;

      // Check for >24h sessions (calculateSessions already filters these,
      // but flag them as validation issues)
      for (const s of sessions) {
        if (s.hours > 24) {
          issues.push('Sesión con duración mayor a 24 horas detectada');
        }
      }

      // Validate hours
      if (totalHours === 0 && punches.length > 0) {
        if (inferred.deduped.length === 1) {
          issues.push('Solo un registro (sin salida inferible)');
        } else {
          issues.push('Sin horas calculadas a pesar de tener registros');
        }
      }

      if (totalHours > 16) {
        issues.push(`Horas excesivas: ${totalHours}h (más de 16h)`);
      }

      // Check for incomplete shifts
      if (entryCount > exitCount) {
        issues.push('Empleado aún en turno (sin salida registrada)');
      }

      // Multi-plant validation
      if (plantsUsed.length > 1) {
        issues.push(`Registros en múltiples plantas: ${plantsUsed.join(', ')}`);
      }

      // Flag duplicate scans (raw count much higher than deduped)
      if (punches.length > inferred.deduped.length + 1) {
        issues.push(
          `${punches.length - inferred.deduped.length} registro(s) duplicados filtrados`,
        );
      }

      const isValid = issues.length === 0;
      if (isValid) validCount++;
      else invalidCount++;

      validationResults.push({
        employeeName: info?.employee_name || `Empleado #${empNum}`,
        employeeNumber: empNum,
        department: info?.department || 'N/A',
        date: dateParam,
        isValid,
        totalHours,
        totalEntries: entryCount,
        totalExits: exitCount,
        issues,
        plantsUsed,
      });
    }

    // Sort: invalid first, then by employee number
    validationResults.sort((a, b) => {
      if (a.isValid !== b.isValid) return a.isValid ? 1 : -1;
      return (a.employeeNumber as string).localeCompare(
        b.employeeNumber as string,
        undefined,
        { numeric: true },
      );
    });

    return NextResponse.json({
      success: true,
      validationResults,
      summary: {
        totalEmployees: validationResults.length,
        validEmployees: validCount,
        invalidEmployees: invalidCount,
        totalRecords: entries.length,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error en validación multi-planta:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Error al realizar validación',
        details: message,
      },
      { status: 500 },
    );
  }
}
