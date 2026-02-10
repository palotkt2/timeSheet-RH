import { NextResponse } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';
import { getDB, initDB } from '@/lib/db';

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

    const entries = mpDb
      .prepare(
        `
      SELECT pe.employee_number, pe.timestamp, pe.action, pe.plant_id, p.name as plant_name
      FROM plant_entries pe
      INNER JOIN plants p ON pe.plant_id = p.id
      WHERE date(pe.timestamp) = ?
      ORDER BY pe.employee_number ASC, pe.timestamp ASC
    `,
      )
      .all(dateStr) as PunchEntry[];

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

    // Minimum gap (ms) between first and last scan to consider the last one an exit
    const MIN_GAP_MS = 60 * 60 * 1000; // 1 hour

    const activeEmployees: Array<Record<string, unknown>> = [];
    const completedEmployees: Array<Record<string, unknown>> = [];
    const allEmployeesToday: Array<Record<string, unknown>> = [];

    for (const [empNum, data] of employeeStatus) {
      const info = empMap.get(empNum);
      const shift = shiftMap.get(empNum);

      // Sort all scans chronologically
      const sorted = [...data.entries].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      const firstScan = sorted[0];
      const lastScan = sorted[sorted.length - 1];
      const firstTime = new Date(firstScan.timestamp).getTime();
      const lastTime = new Date(lastScan.timestamp).getTime();
      const gap = lastTime - firstTime;

      // Infer entry/exit from timing:
      // - First scan of the day = always Entry
      // - Last scan of the day = Exit IF enough time has passed (>1 hour gap)
      const inferredEntries = 1;
      const inferredExits = sorted.length >= 2 && gap >= MIN_GAP_MS ? 1 : 0;
      const isActive = inferredExits === 0;

      // For display: compute worked hours if completed
      const workedHours =
        inferredExits > 0
          ? Math.round((gap / (1000 * 60 * 60)) * 100) / 100
          : 0;

      // Update lastAction based on inference
      data.lastAction = isActive ? 'Entrada' : 'Salida';

      const empResult = {
        employeeNumber: empNum,
        employeeName: info?.employee_name || `Empleado #${empNum}`,
        employeeRole: info?.employee_role || 'N/A',
        department: info?.department || 'N/A',
        lastAction: data.lastAction,
        lastTimestamp: data.lastTimestamp,
        lastPlant: data.lastPlant,
        plantsToday: [...data.plantsToday],
        totalEntries: inferredEntries,
        totalExits: inferredExits,
        isActive,
        firstEntry: firstScan.timestamp,
        lastExit: inferredExits > 0 ? lastScan.timestamp : null,
        workedHours,
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
