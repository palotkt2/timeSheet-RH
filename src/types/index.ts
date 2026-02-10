// ═══════════════════════════════════════════════════════════════
// Type definitions for the Multi-Plant HR System
// ═══════════════════════════════════════════════════════════════

// ─── Database: multi_plant.db ─────────────────────────────────

export interface Plant {
  id: number;
  name: string;
  ip_address: string;
  port: number;
  api_base_path: string;
  adapter_type: 'same-app' | 'generic';
  auth_token: string | null;
  field_mapping: string | null;
  use_https: number;
  is_active: number;
  last_sync: string | null;
  created_at: string;
  updated_at: string;
  // Computed fields from queries
  total_entries?: number;
  earliest_entry?: string;
  latest_entry?: string;
}

export interface PlantEntry {
  id: number;
  plant_id: number;
  employee_number: string;
  timestamp: string;
  action: 'Entrada' | 'Salida';
  raw_data: string | null;
  synced_at: string;
  created_at: string;
  // Joined fields
  plant_name?: string;
}

// ─── Database: barcode_entries.db ─────────────────────────────

export interface Employee {
  id: number;
  employee_number: string;
  employee_name: string | null;
  employee_role: string | null;
  department: string | null;
  shift_type: string | null;
  created_at: string;
}

export interface Shift {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  tolerance_minutes: number;
  days: string; // JSON array of day numbers e.g. "[1,2,3,4,5]"
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ShiftAssignment {
  id: number;
  employee_id: string;
  shift_id: number;
  start_date: string;
  end_date: string | null;
  active: number;
  created_at: string;
  // Joined fields
  name?: string;
  start_time?: string;
  end_time?: string;
  tolerance_minutes?: number;
  days?: string;
}

// ─── Adapter Types ────────────────────────────────────────────

export interface AdapterEntry {
  employee_number: string;
  timestamp: string;
  action: string;
  raw: Record<string, unknown>;
  /** Base64 photo data (extracted separately to avoid storing in DB) */
  photo?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface FieldMapping {
  endpoint: string;
  method: string;
  dateParamStart: string;
  dateParamEnd: string;
  dateFormat: string;
  responseDataPath: string;
  fields: {
    employee_number: string;
    timestamp: string;
    action: string;
  };
  actionValues: {
    entry: string[];
    exit: string[];
  };
  pagination: {
    enabled: boolean;
    pageParam: string;
    limitParam: string;
    limitValue: number;
  };
}

// ─── API Response Types ───────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  error?: string;
  details?: string;
  [key: string]: unknown;
  data?: T;
}

export interface PlantListResponse extends ApiResponse {
  plants: Plant[];
}

export interface PlantDetailResponse extends ApiResponse {
  plant: Plant;
}

export interface SyncResult {
  plant: string;
  stats: {
    fetched: number;
    inserted: number;
    duplicates: number;
  };
}

export interface SyncAllResult extends ApiResponse {
  message: string;
  summary: {
    plantsTotal: number;
    plantsSuccess: number;
    plantsFailed: number;
    totalFetched: number;
    totalInserted: number;
  };
  results: Array<{
    plantId: number;
    plantName: string;
    success: boolean;
    stats?: { fetched: number; inserted: number; duplicates: number };
    error?: string;
  }>;
}

// ─── Live Data Types ──────────────────────────────────────────

export interface LiveEmployeeStatus {
  employeeNumber: string;
  employeeName: string;
  employeeRole: string;
  department: string;
  lastAction: string;
  lastTimestamp: string;
  lastPlant: string;
  plantsToday: string[];
  totalEntries: number;
  totalExits: number;
  isActive: boolean;
  firstEntry?: string;
  lastExit?: string | null;
  workedHours?: number;
  shiftName?: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
}

export interface LiveDataResponse extends ApiResponse {
  date: string;
  timestamp: string;
  summary: {
    totalEmployeesToday: number;
    currentlyActive: number;
    completed: number;
  };
  activeEmployees: LiveEmployeeStatus[];
  completedEmployees: LiveEmployeeStatus[];
  allEmployeesToday: LiveEmployeeStatus[];
  plantSummary: Array<{
    id: number;
    name: string;
    ip_address: string;
    employees_today: number;
  }>;
}

// ─── Report Types ─────────────────────────────────────────────

export interface DayInfo {
  date: string;
  dayName: string;
  dayNumber: number;
  dayOfWeek: number;
}

export interface DailyData {
  date: string;
  dayName: string;
  status: string;
  hours: number;
  firstEntry: string | null;
  lastExit: string | null;
  sessions: Array<{ entry: string; exit: string; hours: number }>;
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

export interface EmployeeReport {
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
  dailyData: Record<string, DailyData>;
  totalHours: number;
  totalOvertimeHours: number;
  daysPresent: number;
  daysComplete: number;
  daysIncomplete: number;
  totalLateMinutes: number;
  daysLate: number;
  attendanceRate: number;
}

export interface WeeklyReportResponse extends ApiResponse {
  startDate: string;
  endDate: string;
  workdays: DayInfo[];
  summary: {
    totalEmployees: number;
    totalWorkdays: number;
    totalEmployeeWorkdays: number;
    totalHours: number;
    averageHoursPerEmployee: number;
    employeesWithPerfectAttendance: number;
    employeesWithIssues: number;
    averageAttendanceRate: number;
    plants: Array<{ id: number; name: string }>;
  };
  employees: EmployeeReport[];
  generatedAt: string;
  totalRecords: number;
  actualWorkdays?: number;
  scheduleConfig?: ScheduleConfig | null;
}

export interface ScheduleConfig {
  schedule: {
    active: boolean;
    days: string;
    entry_time?: string;
    min_hours?: number;
    tolerance_minutes?: number;
    [key: string]: unknown;
  } | null;
  holidays: Array<{ date: string; name?: string }>;
}

// ─── Hook Return Types ────────────────────────────────────────

export type DayStatusCode = 'A' | 'A+' | 'R' | 'F' | 'H' | 'N' | 'E';

export interface SyncStatus {
  type: 'single' | 'all';
  plantId?: number;
  status: 'syncing' | 'done' | 'error';
  result?: SyncResult | SyncAllResult;
  error?: string;
}

export interface AlertMessage {
  type: 'success' | 'error' | 'info' | 'warning';
  text: string;
}

export interface SyncLogEntry {
  time: string;
  message: string;
  type: 'success' | 'error';
  details?: Array<{
    success: boolean;
    plantName: string;
    stats?: { inserted: number; duplicates: number };
    error?: string;
  }>;
}

// ─── Active Employees Report Types ────────────────────────────

export interface ActiveEmployee {
  employeeNumber: string;
  employeeName: string;
  employeeRole: string;
  department: string;
  currentWorkHours: number;
  firstEntry: string;
  lastActivity: string;
  totalEntries: number;
  totalExits: number;
  plantsToday: string[];
}

export interface ActiveReportResponse extends ApiResponse {
  activeEmployees: ActiveEmployee[];
  summary: {
    activeEmployees: number;
    totalEmployeesToday: number;
    totalRecordsToday: number;
  };
}

// ─── Daily Report Types ───────────────────────────────────────

export interface DailyEmployee {
  employeeNumber: string;
  employeeName: string;
  employeeRole: string;
  department: string;
  firstEntry: string | null;
  lastExit: string | null;
  totalEntries: number;
  totalExits: number;
  validSessions: number;
  unpairedEntries: number;
  unpairedExits: number;
  totalWorkedHours: number;
  status: string;
  plantsUsed: string[];
  workSessions: Array<{ entry: string; exit: string; hoursWorked: number }>;
}

export interface DailyReportResponse extends ApiResponse {
  date: string;
  summary: {
    totalEmployees: number;
    employeesPresent: number;
    employeesActive: number;
    totalHoursWorked: number;
  };
  employees: DailyEmployee[];
}

// ─── Validation Report Types ──────────────────────────────────

export interface ValidationResult {
  employeeName: string;
  employeeNumber: string;
  department: string;
  date: string;
  isValid: boolean;
  totalHours: number;
  totalEntries: number;
  totalExits: number;
  issues: string[];
  plantsUsed: string[];
}

export interface ValidationReportResponse extends ApiResponse {
  validationResults: ValidationResult[];
  summary: {
    totalEmployees: number;
    validEmployees: number;
    invalidEmployees: number;
    totalRecords: number;
  };
}

// ─── Form Types ───────────────────────────────────────────────

export interface PlantFormData {
  name: string;
  ip_address: string;
  port: number;
  api_base_path: string;
  adapter_type: 'same-app' | 'generic';
  auth_token: string;
  field_mapping: string | null;
  use_https: boolean;
}

export interface ReportFormData {
  startDate: string;
  endDate: string;
  employeeNumber?: string;
  shiftId?: string;
}

export interface DatePreset {
  start: string;
  end: string;
  label: string;
}

export interface DatePresets {
  thisWeek: DatePreset;
  lastWeek: DatePreset;
  thisMonth: DatePreset;
}
