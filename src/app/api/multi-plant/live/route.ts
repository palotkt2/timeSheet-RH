import { NextResponse } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';
import { getDB, initDB } from '@/lib/db';
import {
  inferEntryExit,
  isEmployeeActive,
  calculateSessions,
  buildNightShiftBoundary,
  remapNightShiftDate,
} from '@/utils/scanInference';
import { formatLocalDateTime, formatLocalDate } from '@/utils/dateUtils';

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
  plant_id: number;
  plant_name: string;
}

interface EmployeeStatusData {
  employee_number: string;
  entries: PunchEntry[];
  lastAction: string | null;
  lastTimestamp: string | null;
  lastPlant: string | null;
  plantsToday: Set<string>;
}

// GET /api/multi-plant/live
export async function GET() {
  try {
    initDB();
    const mpDb = getMultiPlantDB();
    const mainDb = getDB();

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Query yesterday + today to capture night-shift scans that cross midnight
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatLocalDate(yesterday);

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
    const nsShiftMap = new Map<
      string,
      { start_time: string; end_time: string }
    >();
    localShifts.forEach((s) => nsShiftMap.set(s.employee_number, s));
    mpShifts.forEach((s) => nsShiftMap.set(s.employee_number, s));
    const nightShiftBoundary = buildNightShiftBoundary(nsShiftMap);

    const allEntries = mpDb
      .prepare(
        `
      SELECT pe.employee_number, pe.timestamp, pe.action, pe.plant_id, p.name as plant_name,
             date(pe.timestamp) as workDate
      FROM plant_entries pe
      INNER JOIN plants p ON pe.plant_id = p.id
      WHERE date(pe.timestamp) BETWEEN ? AND ?
      ORDER BY pe.employee_number ASC, pe.timestamp ASC
    `,
      )
      .all(yesterdayStr, dateStr) as (PunchEntry & { workDate: string })[];

    // Remap night-shift scans and filter to today
    const entries: PunchEntry[] = [];
    for (const entry of allEntries) {
      const logicalDate = remapNightShiftDate(
        entry.workDate,
        entry.timestamp,
        nightShiftBoundary,
        entry.employee_number,
      );
      if (logicalDate === dateStr) {
        entries.push(entry);
      }
    }

    const employeeInfo = mpDb
      .prepare(
        `
      SELECT employee_number, employee_name, employee_role, department
      FROM employee_names
    `,
      )
      .all() as EmployeeInfo[];

    // Fallback to mainDb employee_shifts for any missing
    const mainEmpInfo = mainDb
      .prepare(
        `SELECT DISTINCT employee_number, employee_name, employee_role, department FROM employee_shifts`,
      )
      .all() as EmployeeInfo[];

    const empMap = new Map<string, EmployeeInfo>();
    mainEmpInfo.forEach((e) => empMap.set(e.employee_number, e));
    employeeInfo.forEach((e) => empMap.set(e.employee_number, e));

    // Load shift assignments for employee → shift mapping
    const shiftAssignments = mpDb
      .prepare(
        `SELECT employee_number, shift_name, start_time, end_time
         FROM shift_assignments
         WHERE active = 1`,
      )
      .all() as Array<{
      employee_number: string;
      shift_name: string;
      start_time: string;
      end_time: string;
    }>;
    const shiftMap = new Map(
      shiftAssignments.map((sa) => [
        sa.employee_number,
        {
          shiftName: sa.shift_name,
          startTime: sa.start_time,
          endTime: sa.end_time,
        },
      ]),
    );

    const employeeStatus = new Map<string, EmployeeStatusData>();

    entries.forEach((entry) => {
      if (!employeeStatus.has(entry.employee_number)) {
        employeeStatus.set(entry.employee_number, {
          employee_number: entry.employee_number,
          entries: [],
          lastAction: null,
          lastTimestamp: null,
          lastPlant: null,
          plantsToday: new Set(),
        });
      }
      const emp = employeeStatus.get(entry.employee_number)!;
      emp.entries.push(entry);
      emp.lastTimestamp = entry.timestamp;
      emp.lastPlant = entry.plant_name;
      emp.plantsToday.add(entry.plant_name);
    });

    const activeEmployees: Array<Record<string, unknown>> = [];
    const completedEmployees: Array<Record<string, unknown>> = [];
    const allEmployeesToday: Array<Record<string, unknown>> = [];

    for (const [empNum, data] of employeeStatus) {
      const info = empMap.get(empNum);
      const shift = shiftMap.get(empNum);

      // Collect raw scan timestamps
      const rawScans = data.entries.map((e) => new Date(e.timestamp));

      // Use shared inference module (same logic as Weekly Report)
      const inferred = inferEntryExit(rawScans);
      const active = isEmployeeActive(inferred);
      const { sessions, totalHours } = calculateSessions(
        inferred.entries,
        inferred.exits,
      );

      // For active employees, add elapsed time from last unmatched entry
      let workedHours = totalHours;
      if (active && inferred.entries.length > inferred.exits.length) {
        const lastUnmatchedEntry =
          inferred.entries[inferred.entries.length - 1];
        const elapsed =
          (Date.now() - lastUnmatchedEntry.getTime()) / (1000 * 60 * 60);
        if (elapsed >= 0 && elapsed <= 24) {
          workedHours += elapsed;
        }
      }
      workedHours = Math.round(workedHours * 100) / 100;

      data.lastAction = active ? 'Entrada' : 'Salida';

      const firstEntry = inferred.entries[0] ?? null;
      const lastExit =
        inferred.exits.length > 0
          ? inferred.exits[inferred.exits.length - 1]
          : null;

      const empResult = {
        employeeNumber: empNum,
        employeeName: info?.employee_name || `Empleado #${empNum}`,
        employeeRole: info?.employee_role || 'N/A',
        department: info?.department || 'N/A',
        lastAction: data.lastAction,
        lastTimestamp: data.lastTimestamp,
        lastPlant: data.lastPlant,
        plantsToday: [...data.plantsToday],
        totalEntries: inferred.entries.length,
        totalExits: inferred.exits.length,
        isActive: active,
        firstEntry: firstEntry ? formatLocalDateTime(firstEntry) : null,
        lastExit: lastExit ? formatLocalDateTime(lastExit) : null,
        workedHours,
        sessions: sessions.map((s) => ({
          entry: formatLocalDateTime(s.entry),
          exit: formatLocalDateTime(s.exit),
          hours: s.hours,
        })),
        shiftName: shift?.shiftName || null,
        shiftStartTime: shift?.startTime || null,
        shiftEndTime: shift?.endTime || null,
      };

      allEmployeesToday.push(empResult);
      if (empResult.isActive) activeEmployees.push(empResult);
      else completedEmployees.push(empResult);
    }

    const plantSummary = mpDb
      .prepare(
        `
      SELECT p.id, p.name, p.ip_address,
        (SELECT COUNT(DISTINCT pe2.employee_number)
         FROM plant_entries pe2 WHERE pe2.plant_id = p.id AND date(pe2.timestamp) = ?) as employees_today
      FROM plants p WHERE p.is_active = 1
    `,
      )
      .all(dateStr);

    return NextResponse.json({
      success: true,
      date: dateStr,
      timestamp: new Date().toISOString(),
      summary: {
        totalEmployeesToday: allEmployeesToday.length,
        currentlyActive: activeEmployees.length,
        completed: completedEmployees.length,
      },
      activeEmployees,
      completedEmployees,
      allEmployeesToday,
      plantSummary,
    });
  } catch (error) {
    console.error('Error fetching live data:', error);
    return NextResponse.json(
      { success: false, error: 'Error al obtener datos en tiempo real' },
      { status: 500 },
    );
  }
}
