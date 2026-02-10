import { NextResponse } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';
import { getDB, initDB } from '@/lib/db';
import { formatLocalDate } from '@/utils/dateUtils';

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
 * GET /api/multi-plant/reports/active
 * Returns currently active employees (clocked in without clock-out) from all plants.
 */
export async function GET() {
  try {
    initDB();
    const mpDb = getMultiPlantDB();
    const mainDb = getDB();

    const today = formatLocalDate(new Date());

    // Get all entries for today from all plants
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
      .all(today) as PunchEntry[];

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

    const activeEmployees: Array<Record<string, unknown>> = [];
    let totalRecordsToday = 0;

    // Minimum gap between first and last scan to consider it an exit
    const MIN_GAP_MS = 60 * 60 * 1000; // 1 hour

    for (const [empNum, punches] of employeeEntries) {
      totalRecordsToday += punches.length;
      const info = empMap.get(empNum);

      // Sort scans chronologically
      const sorted = [...punches].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const firstScan = sorted[0];
      const lastScan = sorted[sorted.length - 1];
      const firstTime = new Date(firstScan.timestamp).getTime();
      const lastTime = new Date(lastScan.timestamp).getTime();
      const gap = lastTime - firstTime;

      // Infer active status: if only 1 scan or all scans close together → active
      const hasExit = sorted.length >= 2 && gap >= MIN_GAP_MS;
      const isActive = !hasExit;

      if (isActive) {
        const plantsToday = [...new Set(punches.map((p) => p.plant_name))];

        // Calculate hours worked so far (from first scan to now)
        const now = new Date();
        const hoursWorked = (now.getTime() - firstTime) / (1000 * 60 * 60);

        activeEmployees.push({
          employeeNumber: empNum,
          employeeName: info?.employee_name || `Empleado #${empNum}`,
          employeeRole: info?.employee_role || 'N/A',
          department: info?.department || 'N/A',
          currentWorkHours:
            hoursWorked >= 0 && hoursWorked <= 24
              ? Math.round(hoursWorked * 100) / 100
              : 0,
          firstEntry: firstScan.timestamp,
          lastActivity: lastScan.timestamp,
          totalEntries: 1,
          totalExits: 0,
          plantsToday,
        });
      }
    }

    return NextResponse.json({
      success: true,
      activeEmployees,
      summary: {
        activeEmployees: activeEmployees.length,
        totalEmployeesToday: employeeEntries.size,
        totalRecordsToday,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error en reporte de empleados activos multi-planta:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Error al obtener empleados activos',
        details: message,
      },
      { status: 500 },
    );
  }
}
