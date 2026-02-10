import { NextResponse, NextRequest } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';
import { getDB, initDB } from '@/lib/db';
import { formatLocalDate } from '@/utils/dateUtils';
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

    // Get all entries for the date
    const entries = mpDb
      .prepare(
        `
        SELECT pe.employee_number, pe.timestamp, pe.action, p.name as plant_name
        FROM plant_entries pe
        INNER JOIN plants p ON pe.plant_id = p.id
        WHERE date(pe.timestamp) = ?
        ORDER BY pe.employee_number ASC, pe.timestamp ASC
      `,
      )
      .all(dateParam) as PunchEntry[];

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

      // Calculate hours from inferred sessions
      let totalHours = 0;
      let exitIdx = 0;

      for (let i = 0; i < entryTimes.length; i++) {
        const entryTime = entryTimes[i];
        while (exitIdx < exitTimes.length && exitTimes[exitIdx] <= entryTime)
          exitIdx++;

        if (exitIdx < exitTimes.length) {
          const hours =
            (exitTimes[exitIdx].getTime() - entryTime.getTime()) /
            (1000 * 60 * 60);
          if (hours >= 0.1 && hours <= 24) {
            totalHours += hours;
            exitIdx++;
          } else if (hours > 24) {
            issues.push('Sesión con duración mayor a 24 horas detectada');
          }
        }
      }

      totalHours = Math.round(totalHours * 100) / 100;

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
