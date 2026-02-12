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

// ── Helpers ──

interface Session {
  entry: string;
  exit: string;
  hours: number;
}

function calculateDailyHours(
  entries: Date[],
  exits: Date[],
): { totalHours: number; rawTotalHours: number; sessions: Session[] } {
  const {
    sessions: rawSessions,
    totalHours,
    rawTotalHours,
  } = calculateSessions(entries, exits);
  const sessions: Session[] = rawSessions.map((s) => ({
    entry: formatLocalDateTime(s.entry),
    exit: formatLocalDateTime(s.exit),
    hours: s.hours,
  }));
  return { totalHours, rawTotalHours, sessions };
}

function getDayStatus(
  entriesCount: number,
  exitsCount: number,
  hasValidSessions: boolean,
  totalHours: number,
  expectedHours = 9.5,
): string {
  // Si no hay registros en absoluto
  if (entriesCount === 0 && exitsCount === 0) return 'Ausente';

  // Use 60% of expected shift hours as "Completo" threshold
  const completeThreshold = Math.max(expectedHours * 0.6, 1);

  // Si hay horas trabajadas suficientes, es un día completo o parcial
  if (hasValidSessions && totalHours >= completeThreshold) return 'Completo';
  if (hasValidSessions && totalHours >= 1) return 'Parcial';

  // Casos problemáticos: registros pero sin sesiones válidas
  if (entriesCount > 0 && exitsCount === 0) return 'Sin salida';
  if (!hasValidSessions || totalHours < 0.1) return 'Incompleto';

  return 'Incompleto';
}

function calculateLateMinutes(
  entryTime: Date,
  shiftStartTime: string,
  shiftEndTime: string,
  toleranceMinutes = 0,
): number {
  if (!entryTime || !shiftStartTime) return 0;
  const entry = new Date(entryTime);
  const [hours, minutes] = shiftStartTime.split(':').map(Number);
  const shiftStart = new Date(entry);
  shiftStart.setHours(hours, minutes, 0, 0);

  // Night shift: if shift start hour > shift end hour, the shift may start
  // the previous evening. Adjust shiftStart to the nearest occurrence
  // relative to the entry time (within ±12 hours).
  const [eh] = shiftEndTime.split(':').map(Number);
  if (hours > eh) {
    // Night shift detected — entry could be in the evening or early morning
    const diff = entry.getTime() - shiftStart.getTime();
    if (diff < -12 * 60 * 60 * 1000) {
      // Entry is next day relative to shiftStart → move shiftStart forward
      shiftStart.setDate(shiftStart.getDate() + 1);
    } else if (diff > 12 * 60 * 60 * 1000) {
      // Entry is previous day relative to shiftStart → move shiftStart backward
      shiftStart.setDate(shiftStart.getDate() - 1);
    }
  }

  const diffMinutes = Math.floor(
    (entry.getTime() - shiftStart.getTime()) / (1000 * 60),
  );
  // Negative means early arrival, not late
  if (diffMinutes <= toleranceMinutes) return 0;
  // Cap at reasonable maximum (full shift duration) to discard nonsense values
  if (diffMinutes > 12 * 60) return 0;
  return diffMinutes;
}

function calculateShiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let s = sh + sm / 60,
    e = eh + em / 60;
  if (e < s) e += 24;
  return e - s;
}

function validateParams(
  startDate: string | null,
  endDate: string | null,
): string[] {
  const errors: string[] = [];
  if (!startDate) errors.push('startDate es requerido');
  if (startDate && isNaN(Date.parse(startDate)))
    errors.push('startDate inválido');
  if (endDate && isNaN(Date.parse(endDate))) errors.push('endDate inválido');
  if (startDate && endDate && new Date(endDate) < new Date(startDate))
    errors.push('La fecha de fin no puede ser anterior a la de inicio');
  const daysDiff =
    endDate && startDate
      ? Math.ceil(
          (new Date(endDate).getTime() - new Date(startDate).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 5;
  if (daysDiff > 90) errors.push('Rango > 90 días');
  return errors;
}

// ── Interfaces ──

interface PunchRecord {
  employeeNumber: string;
  workDate: string;
  timestamp: string;
  action: string;
  plant_id: number;
  plant_name: string;
}

interface EmployeeRow {
  employee_number: string;
  employee_name: string;
  employee_role: string;
  department: string;
}

interface ShiftRow {
  name: string;
  start_time: string;
  end_time: string;
  tolerance_minutes: number;
  days: string;
}

interface ShiftAssignmentRow extends ShiftRow {
  employee_id: string;
  shift_id: number;
}

interface DayInfo {
  date: string;
  dayName: string;
  dayNumber: number;
  dayOfWeek: number;
}

interface DayRecords {
  allScans: Date[];
  entries: Date[];
  exits: Date[];
  plants: Set<string>;
}

interface DailyDataEntry {
  date: string;
  dayName: string;
  status: string;
  hours: number;
  firstEntry: string | null;
  lastExit: string | null;
  sessions: Session[];
  isWorkday: boolean;
  plantsUsed: string[];
  entriesCount?: number;
  exitsCount?: number;
  lateMinutes?: number;
  shiftStartTime?: string;
  shiftEndTime?: string;
  overtimeHours?: number;
  isNonWorkday?: boolean;
}

// ── Route Handler ──

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const employeeNumber = searchParams.get('employeeNumber');
    const shiftId = searchParams.get('shiftId');

    const validationErrors = validateParams(startDate, endDateParam);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { success: false, error: validationErrors.join('; ') },
        { status: 400 },
      );
    }

    let endDate = endDateParam;
    if (!endDate && startDate) {
      const start = createLocalDate(startDate);
      const friday = new Date(start);
      friday.setDate(start.getDate() + 4);
      endDate = formatLocalDate(friday);
    }

    initDB();
    const mpDb = getMultiPlantDB();
    const mainDb = getDB();

    // Extend query by ±1 day to capture night-shift scans that cross midnight
    const qStart = createLocalDate(startDate!);
    qStart.setDate(qStart.getDate() - 1);
    const qEnd = createLocalDate(endDate!);
    qEnd.setDate(qEnd.getDate() + 1);

    // Fetch punch records from multi-plant DB
    // NO filtrar por action - inferiremos entrada/salida por timing
    let query = `
      SELECT pe.employee_number as employeeNumber, date(pe.timestamp) as workDate,
        pe.timestamp, pe.action, pe.plant_id, p.name as plant_name
      FROM plant_entries pe
      INNER JOIN plants p ON pe.plant_id = p.id
      WHERE date(pe.timestamp) BETWEEN ? AND ?
    `;
    const params: string[] = [formatLocalDate(qStart), formatLocalDate(qEnd)];
    if (employeeNumber) {
      query += ` AND pe.employee_number = ?`;
      params.push(employeeNumber);
    }
    query += ` ORDER BY pe.employee_number ASC, pe.timestamp ASC`;
    const records = mpDb.prepare(query).all(...params) as PunchRecord[];

    // Employee info
    let employeeQuery: string;
    let employeeParams: string[];
    if (employeeNumber) {
      employeeQuery = `SELECT employee_number, employee_name, employee_role, department FROM employee_shifts WHERE employee_number = ?`;
      employeeParams = [employeeNumber];
    } else if (shiftId) {
      // First: get employees from local DB shift_assignments
      employeeQuery = `
        SELECT DISTINCT es.employee_number, es.employee_name, es.employee_role, es.department
        FROM employee_shifts es
        INNER JOIN shift_assignments sa ON es.employee_number = sa.employee_id
        WHERE sa.active = 1 AND sa.shift_id = ? AND (sa.end_date IS NULL OR sa.end_date >= ?) AND sa.start_date <= ?
        ORDER BY es.employee_number
      `;
      employeeParams = [shiftId, startDate!, endDate!];
    } else {
      employeeQuery = `SELECT DISTINCT employee_number, employee_name, employee_role, department FROM employee_shifts ORDER BY employee_number`;
      employeeParams = [];
    }
    const employeeInfo = mainDb
      .prepare(employeeQuery)
      .all(...employeeParams) as EmployeeRow[];
    const employeeMap = new Map<string, EmployeeRow>();
    employeeInfo.forEach((emp) => employeeMap.set(emp.employee_number, emp));

    // Merge employee names from multi_plant.db (takes priority)
    const mpEmployees = mpDb
      .prepare(
        `SELECT employee_number, employee_name, employee_role, department FROM employee_names`,
      )
      .all() as EmployeeRow[];
    mpEmployees.forEach((emp) => employeeMap.set(emp.employee_number, emp));

    // If filtering by shiftId, also include employees from multi_plant.db shift_assignments
    if (shiftId) {
      const mpShiftEmployees = mpDb
        .prepare(
          `SELECT DISTINCT sa.employee_number
           FROM shift_assignments sa
           WHERE sa.active = 1 AND sa.shift_id = ?`,
        )
        .all(shiftId) as Array<{ employee_number: string }>;
      for (const { employee_number } of mpShiftEmployees) {
        if (!employeeMap.has(employee_number)) {
          const emp = mpDb
            .prepare(
              `SELECT employee_number, employee_name, employee_role, department FROM employee_names WHERE employee_number = ?`,
            )
            .get(employee_number) as EmployeeRow | undefined;
          if (emp) employeeMap.set(employee_number, emp);
        }
      }
    }

    // Shifts — merge from local DB + multi_plant.db
    const defaultShift = mainDb
      .prepare('SELECT * FROM shifts WHERE id = 1')
      .get() as ShiftRow | undefined;

    // Local shift assignments
    const shiftAssignments = mainDb
      .prepare(
        `
      SELECT sa.employee_id, sa.shift_id, s.name, s.start_time, s.end_time, s.tolerance_minutes, s.days
      FROM shift_assignments sa INNER JOIN shifts s ON sa.shift_id = s.id
      WHERE sa.active = 1 AND (sa.end_date IS NULL OR sa.end_date >= ?) AND sa.start_date <= ?
    `,
      )
      .all(startDate!, endDate!) as ShiftAssignmentRow[];

    const employeeShiftMap = new Map<
      string,
      {
        id: number;
        name: string;
        start_time: string;
        end_time: string;
        tolerance_minutes: number;
        days: string;
        custom_hours?: Record<
          string,
          { end_time?: string; start_time?: string }
        >;
      }
    >();
    // Local assignments first
    shiftAssignments.forEach((a) => {
      employeeShiftMap.set(a.employee_id, {
        id: a.shift_id,
        name: a.name,
        start_time: a.start_time,
        end_time: a.end_time,
        tolerance_minutes: a.tolerance_minutes ?? 15,
        days: a.days,
      });
    });

    // Multi-plant shift assignments (override local if present — remote plants are authoritative)
    // Employees can check in at any checador; the shift assignment comes from
    // the remote system, not from where they scan. When duplicates exist across
    // plants, we deduplicate by keeping the most specific (non-default) shift.
    // Manual (admin-assigned) shifts always take highest priority.
    const mpShiftAssignments = mpDb
      .prepare(
        `SELECT sa.employee_number, sa.shift_id, sa.shift_name, sa.start_time, sa.end_time, sa.days,
                sa.source_plant_id, sa.is_manual, s.tolerance_minutes, s.custom_hours
         FROM shift_assignments sa
         LEFT JOIN shifts s ON sa.shift_id = s.remote_shift_id AND sa.source_plant_id = s.source_plant_id
         WHERE sa.active = 1
         ORDER BY sa.is_manual DESC, sa.id DESC`,
      )
      .all() as Array<{
      employee_number: string;
      shift_id: number;
      shift_name: string;
      start_time: string;
      end_time: string;
      days: string;
      source_plant_id: number;
      is_manual: number;
      tolerance_minutes: number | null;
      custom_hours: string | null;
    }>;

    // Group assignments by employee, then pick the best one
    const assignmentsByEmp = new Map<string, typeof mpShiftAssignments>();
    mpShiftAssignments.forEach((a) => {
      if (!assignmentsByEmp.has(a.employee_number))
        assignmentsByEmp.set(a.employee_number, []);
      assignmentsByEmp.get(a.employee_number)!.push(a);
    });

    for (const [empNum, assignments] of assignmentsByEmp) {
      let chosen = assignments[0];
      if (assignments.length > 1) {
        // 1) Manual assignment always wins
        const manual = assignments.find((a) => a.is_manual === 1);
        if (manual) {
          chosen = manual;
        } else {
          // 2) Prefer the most specific shift (not the generic "Turno Matutino L - V" 06:00)
          const nonDefault = assignments.find(
            (a) =>
              a.start_time !== '06:00' ||
              a.shift_name.toLowerCase().includes('oficina') ||
              a.shift_name.toLowerCase().includes('chofer'),
          );
          if (nonDefault) chosen = nonDefault;
        }
      }

      const a = chosen;
      let customHours:
        | Record<string, { end_time?: string; start_time?: string }>
        | undefined;
      if (a.custom_hours) {
        try {
          const parsed = JSON.parse(a.custom_hours);
          if (Object.keys(parsed).length > 0) customHours = parsed;
        } catch {
          /* ignore */
        }
      }
      employeeShiftMap.set(empNum, {
        id: a.shift_id,
        name: a.shift_name || 'Turno Asignado',
        start_time: a.start_time || '06:00',
        end_time: a.end_time || '15:30',
        tolerance_minutes: a.tolerance_minutes ?? 15,
        days: a.days || '[1,2,3,4,5]',
        custom_hours: customHours,
      });
    }

    // Detect night shift employees for cross-midnight date remapping
    const nightShiftBoundary = buildNightShiftBoundary(employeeShiftMap);

    // Group records by employee → shift day (adjusting for night-shift cross-midnight)
    const employeeData = new Map<string, Map<string, DayRecords>>();
    records.forEach((record) => {
      const workDate = remapNightShiftDate(
        record.workDate,
        record.timestamp,
        nightShiftBoundary,
        record.employeeNumber,
      );

      if (!employeeData.has(record.employeeNumber))
        employeeData.set(record.employeeNumber, new Map());
      const dates = employeeData.get(record.employeeNumber)!;
      if (!dates.has(workDate))
        dates.set(workDate, {
          allScans: [],
          entries: [],
          exits: [],
          plants: new Set(),
        });
      const day = dates.get(workDate)!;
      const timestamp = new Date(record.timestamp);
      day.allScans.push(timestamp);
      day.plants.add(record.plant_name);
    });

    // Infer entry/exit using shared inference module (consistent with Live view)
    for (const [, dates] of employeeData) {
      for (const [, dayRecords] of dates) {
        const inferred = inferEntryExit(dayRecords.allScans);
        dayRecords.entries = inferred.entries;
        dayRecords.exits = inferred.exits;
      }
    }

    // Generate all days in range
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const allDays: DayInfo[] = [];
    const current = createLocalDate(startDate!);
    const end = createLocalDate(endDate!);
    while (current <= end) {
      allDays.push({
        date: formatLocalDate(current),
        dayName: dayNames[current.getDay()],
        dayNumber: current.getDate(),
        dayOfWeek: current.getDay(),
      });
      current.setDate(current.getDate() + 1);
    }

    // Resolve shift for an employee
    const resolveShift = (empNumber: string) => {
      return (
        employeeShiftMap.get(empNumber) || {
          id: 1,
          name: defaultShift?.name || 'Turno Matutino',
          start_time: defaultShift?.start_time || '06:00',
          end_time: defaultShift?.end_time || '15:30',
          tolerance_minutes: defaultShift?.tolerance_minutes ?? 15,
          days: defaultShift?.days || '[1,2,3,4,5]',
        }
      );
    };

    const parseWorkDays = (days: string): number[] => {
      try {
        return JSON.parse(days);
      } catch {
        return [1, 2, 3, 4, 5];
      }
    };

    // Day-of-week name mappings for custom_hours lookup
    const dayOfWeekNames: Record<number, string[]> = {
      0: ['0', 'sunday', 'domingo', 'dom'],
      1: ['1', 'monday', 'lunes', 'lun'],
      2: ['2', 'tuesday', 'martes', 'mar'],
      3: ['3', 'wednesday', 'miercoles', 'miércoles', 'mié', 'mie'],
      4: ['4', 'thursday', 'jueves', 'jue'],
      5: ['5', 'friday', 'viernes', 'vie'],
      6: ['6', 'saturday', 'sabado', 'sábado', 'sáb', 'sab'],
    };

    /**
     * Resolve the effective shift end_time for a specific day,
     * taking custom_hours overrides into account.
     */
    const getEffectiveEndTime = (
      shift: typeof employeeShiftMap extends Map<string, infer V> ? V : never,
      dayOfWeek: number,
    ): string => {
      if (!shift.custom_hours) return shift.end_time;
      const aliases = dayOfWeekNames[dayOfWeek] || [];
      for (const alias of aliases) {
        const override = shift.custom_hours[alias];
        if (override?.end_time) return override.end_time;
      }
      return shift.end_time;
    };

    // Process employees with records
    interface EmployeeResult {
      employeeNumber: string;
      employeeName: string;
      employeeRole: string;
      department: string;
      shift: string;
      shiftStartTime: string;
      shiftEndTime: string;
      shiftWorkDays: number[];
      employeeWorkdaysCount: number;
      expectedDailyHours: number;
      dailyData: Record<string, DailyDataEntry>;
      totalHours: number;
      totalOvertimeHours: number;
      daysPresent: number;
      daysComplete: number;
      daysIncomplete: number;
      totalLateMinutes: number;
      daysLate: number;
      attendanceRate: number;
    }

    const employees: EmployeeResult[] = [];

    for (const [empNumber, dates] of employeeData) {
      const info = employeeMap.get(empNumber);
      const assignedShift = resolveShift(empNumber);
      const shiftWorkDays = parseWorkDays(assignedShift.days);
      const employeeWorkdays = allDays.filter((d) =>
        shiftWorkDays.includes(d.dayOfWeek),
      );
      const expectedDailyHours = calculateShiftHours(
        assignedShift.start_time,
        assignedShift.end_time,
      );

      const dailyData: Record<string, DailyDataEntry> = {};
      let totalHours = 0,
        daysPresent = 0,
        daysComplete = 0;
      let totalLateMinutes = 0,
        daysLate = 0,
        totalOvertimeHours = 0;

      // Initialize all days
      allDays.forEach((day) => {
        dailyData[day.date] = {
          date: day.date,
          dayName: day.dayName,
          status: 'Ausente',
          hours: 0,
          firstEntry: null,
          lastExit: null,
          sessions: [],
          isWorkday: shiftWorkDays.includes(day.dayOfWeek),
          plantsUsed: [],
        };
      });

      // Process days with records
      for (const [date, dayRecords] of dates) {
        if (!dailyData[date]) continue;
        const { entries, exits, plants } = dayRecords;
        if (entries.length > 0) daysPresent++;

        // Resolve effective shift end time for this specific day (custom_hours override)
        const dayObj = allDays.find((d) => d.date === date);
        const dayOfWeek = dayObj?.dayOfWeek ?? createLocalDate(date).getDay();
        const effectiveEndTime = getEffectiveEndTime(assignedShift, dayOfWeek);
        const effectiveDailyHours = calculateShiftHours(
          assignedShift.start_time,
          effectiveEndTime,
        );

        const {
          totalHours: dayHours,
          rawTotalHours: rawDayHours,
          sessions,
        } = calculateDailyHours(entries, exits);
        const status = getDayStatus(
          entries.length,
          exits.length,
          sessions.length > 0,
          dayHours,
          effectiveDailyHours,
        );
        if (status === 'Completo') daysComplete++;

        // Only calculate late minutes on scheduled workdays
        const isWorkday = dailyData[date].isWorkday;
        const lateMinutes =
          entries.length > 0 && isWorkday
            ? calculateLateMinutes(
                entries[0],
                assignedShift.start_time,
                effectiveEndTime,
                assignedShift.tolerance_minutes || 0,
              )
            : 0;
        if (lateMinutes > 0) {
          totalLateMinutes += lateMinutes;
          daysLate++;
        }

        // Overtime — only count time worked AFTER the shift end (workdays)
        // Early arrivals do NOT count as overtime.
        // Minimum 5 minutes of overtime required (ignore scan-timing noise).
        const OT_MIN_HOURS = 5 / 60; // 5 minutes
        let dailyOvertimeHours = 0;
        if (!dailyData[date].isWorkday) {
          // Non-workday: ALL hours are overtime (use raw to avoid double-rounding)
          dailyOvertimeHours = rawDayHours;
        } else if (sessions.length > 0) {
          // Workday: sum the portion of each session that extends past effective shift end
          const [seh, sem] = effectiveEndTime.split(':').map(Number);
          const shiftEnd = createLocalDate(date);
          shiftEnd.setHours(seh, sem, 0, 0);
          // Night shift: shift end falls on the next calendar day
          const ssh = parseInt(assignedShift.start_time.split(':')[0]);
          if (ssh > seh) shiftEnd.setDate(shiftEnd.getDate() + 1);

          for (const s of sessions) {
            const sExit = new Date(s.exit);
            if (sExit.getTime() > shiftEnd.getTime()) {
              const sEntry = new Date(s.entry);
              const otStart =
                sEntry.getTime() > shiftEnd.getTime() ? sEntry : shiftEnd;
              dailyOvertimeHours +=
                (sExit.getTime() - otStart.getTime()) / (1000 * 60 * 60);
            }
          }
          // Discard sub-5-minute overtime (scan timing noise)
          if (dailyOvertimeHours < OT_MIN_HOURS) dailyOvertimeHours = 0;
        }
        // Round per-day for display; accumulate raw value for accurate total
        const rawDailyOT = dailyOvertimeHours;
        dailyOvertimeHours = Math.round(dailyOvertimeHours * 100) / 100;
        totalOvertimeHours += rawDailyOT;

        dailyData[date] = {
          date,
          dayName: dailyData[date].dayName,
          isWorkday: dailyData[date].isWorkday,
          status,
          hours: dayHours,
          firstEntry: entries[0] ? formatLocalDateTime(entries[0]) : null,
          lastExit: exits[exits.length - 1]
            ? formatLocalDateTime(exits[exits.length - 1])
            : null,
          sessions,
          entriesCount: entries.length,
          exitsCount: exits.length,
          lateMinutes,
          shiftStartTime: assignedShift.start_time,
          shiftEndTime: effectiveEndTime,
          overtimeHours: dailyOvertimeHours,
          plantsUsed: [...plants],
        };
        totalHours += rawDayHours;
      }

      employees.push({
        employeeNumber: empNumber,
        employeeName: info?.employee_name || `Empleado #${empNumber}`,
        employeeRole: info?.employee_role || 'N/A',
        department: info?.department || 'N/A',
        shift: assignedShift.name,
        shiftStartTime: assignedShift.start_time,
        shiftEndTime: assignedShift.end_time,
        shiftWorkDays,
        employeeWorkdaysCount: employeeWorkdays.length,
        expectedDailyHours: Math.round(expectedDailyHours * 100) / 100,
        dailyData,
        totalHours: Math.round(totalHours * 100) / 100,
        totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
        daysPresent,
        daysComplete,
        daysIncomplete: daysPresent - daysComplete,
        totalLateMinutes,
        daysLate,
        attendanceRate:
          employeeWorkdays.length > 0
            ? Math.round((daysPresent / employeeWorkdays.length) * 100)
            : 0,
      });
    }

    // Add employees without records
    if (!employeeNumber) {
      for (const [empNumber, info] of employeeMap) {
        if (!employeeData.has(empNumber)) {
          const assignedShift = resolveShift(empNumber);
          const shiftWorkDays = parseWorkDays(assignedShift.days);
          const employeeWorkdays = allDays.filter((d) =>
            shiftWorkDays.includes(d.dayOfWeek),
          );
          const expectedDailyHours = calculateShiftHours(
            assignedShift.start_time,
            assignedShift.end_time,
          );

          const dailyData: Record<string, DailyDataEntry> = {};
          allDays.forEach((day) => {
            dailyData[day.date] = {
              date: day.date,
              dayName: day.dayName,
              status: 'Ausente',
              hours: 0,
              firstEntry: null,
              lastExit: null,
              sessions: [],
              entriesCount: 0,
              exitsCount: 0,
              isWorkday: shiftWorkDays.includes(day.dayOfWeek),
              plantsUsed: [],
            };
          });

          employees.push({
            employeeNumber: empNumber,
            employeeName: info.employee_name,
            employeeRole: info.employee_role,
            department: info.department,
            shift: assignedShift.name,
            shiftStartTime: assignedShift.start_time,
            shiftEndTime: assignedShift.end_time,
            shiftWorkDays,
            employeeWorkdaysCount: employeeWorkdays.length,
            expectedDailyHours: Math.round(expectedDailyHours * 100) / 100,
            dailyData,
            totalHours: 0,
            totalOvertimeHours: 0,
            daysPresent: 0,
            daysComplete: 0,
            daysIncomplete: 0,
            totalLateMinutes: 0,
            daysLate: 0,
            attendanceRate: 0,
          });
        }
      }
    }

    employees.sort((a, b) =>
      a.employeeNumber.localeCompare(b.employeeNumber, undefined, {
        numeric: true,
      }),
    );

    const activePlants = mpDb
      .prepare('SELECT id, name FROM plants WHERE is_active = 1')
      .all();

    const summary = {
      totalEmployees: employees.length,
      totalWorkdays: allDays.length,
      totalEmployeeWorkdays: employees.reduce(
        (s, e) => s + (e.employeeWorkdaysCount || 0),
        0,
      ),
      totalHours:
        Math.round(employees.reduce((s, e) => s + e.totalHours, 0) * 100) / 100,
      averageHoursPerEmployee:
        employees.length > 0
          ? Math.round(
              (employees.reduce((s, e) => s + e.totalHours, 0) /
                employees.length) *
                100,
            ) / 100
          : 0,
      employeesWithPerfectAttendance: employees.filter(
        (e) =>
          e.daysComplete === e.employeeWorkdaysCount &&
          e.daysPresent === e.employeeWorkdaysCount &&
          e.daysLate === 0,
      ).length,
      employeesWithIssues: employees.filter(
        (e) =>
          e.daysIncomplete > 0 ||
          e.daysPresent < e.employeeWorkdaysCount ||
          e.daysLate > 0,
      ).length,
      averageAttendanceRate:
        employees.length > 0
          ? Math.round(
              (employees.reduce((s, e) => s + e.attendanceRate, 0) /
                employees.length) *
                100,
            ) / 100
          : 0,
      plants: activePlants,
    };

    return NextResponse.json({
      success: true,
      startDate,
      endDate,
      workdays: allDays,
      summary,
      employees,
      generatedAt: formatLocalDateTime(new Date()),
      totalRecords: records.length,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error generando reporte semanal multi-planta:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Error interno al generar reporte multi-planta',
        details: message,
      },
      { status: 500 },
    );
  }
}
