import type { Plant, AdapterEntry, ConnectionTestResult } from '@/types';
import {
  BaseAdapter,
  RemoteEmployee,
  resolveDepartmentName,
} from './baseAdapter';

/**
 * Adapter for remote instances that run the same Next.js app.
 * Consumes /api/barcode-entries endpoint with the same format.
 */
export class SameAppAdapter extends BaseAdapter {
  constructor(plantConfig: Plant) {
    super(plantConfig);
  }

  async fetchEntries(
    startDate: string,
    endDate: string,
  ): Promise<AdapterEntry[]> {
    const entries: AdapterEntry[] = [];
    let page = 1;
    const limit = 500;
    let hasMore = true;

    while (hasMore) {
      const url = `${this.baseUrl}/barcode-entries?page=${page}&limit=${limit}&startDate=${startDate}&endDate=${endDate}`;
      const data = (await this._fetch(url)) as {
        success?: boolean;
        data?: Array<{ barcode: string; timestamp: string; action?: string }>;
        entries?: Array<{
          barcode: string;
          timestamp: string;
          action?: string;
        }>;
      };

      // Remote API returns { data: [...] } without date filters, but { entries: [...] } with date filters
      const records = data.data || data.entries;

      if (!records || records.length === 0) {
        hasMore = false;
        break;
      }

      for (const entry of records) {
        entries.push({
          employee_number: String(entry.barcode),
          timestamp: entry.timestamp,
          action: entry.action || 'Entrada',
          raw: entry as unknown as Record<string, unknown>,
        });
      }

      if (records.length < limit) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return entries;
  }

  /**
   * Fetch real employee names from the remote plant.
   * Uses /api/employees/validate/{number} which returns actual names from the DB,
   * unlike /api/employees which only returns placeholders.
   * Resolves truncated department codes to full names.
   * @param employeeNumbers - list of employee numbers to look up
   */
  async fetchEmployeeNames(
    employeeNumbers?: string[],
  ): Promise<RemoteEmployee[]> {
    if (!employeeNumbers || employeeNumbers.length === 0) return [];

    // First, try to get department mapping from remote plant
    const deptMap = await this.fetchDepartments();

    const employees: RemoteEmployee[] = [];
    // Process in batches of 10 to avoid overwhelming the remote server
    const batchSize = 10;

    for (let i = 0; i < employeeNumbers.length; i += batchSize) {
      const batch = employeeNumbers.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(async (empNum) => {
          const data = (await this._fetch(
            `${this.baseUrl}/employees/validate/${empNum}`,
          )) as {
            exists?: boolean;
            employee?: {
              number?: string;
              name?: string;
              role?: string;
              department?: string;
            };
          };
          return data;
        }),
      );

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled' && result.value.employee) {
          const emp = result.value.employee;
          const name = emp.name || '';
          // Skip placeholders
          if (
            !name ||
            name.startsWith('Empleado #') ||
            name.startsWith('Employee #')
          )
            return;

          employees.push({
            employee_number: String(emp.number || batch[idx]),
            employee_name: name,
            employee_role: emp.role || null,
            department: resolveDepartmentName(emp.department, deptMap),
          });
        }
      });
    }

    return employees;
  }

  /**
   * Fetch department list from the remote plant's /api/departments endpoint.
   * Returns a code→name map. Falls back to empty map if endpoint requires auth.
   */
  async fetchDepartments(): Promise<Record<string, string>> {
    try {
      const response = await this._secureFetch(`${this.baseUrl}/departments`, {
        method: 'GET',
        headers: this._getHeaders(),
      });
      if (!response.ok) return {};
      const departments = (await response.json()) as Array<{
        code?: string;
        name?: string;
      }>;
      const map: Record<string, string> = {};
      for (const dept of departments) {
        if (dept.code && dept.name) {
          map[dept.code] = dept.name;
        }
      }
      return map;
    } catch {
      return {};
    }
  }

  /**
   * Fetch shift definitions from the remote plant.
   * GET /api/storage/shifts
   */
  async fetchShifts(): Promise<
    Array<{
      id: number;
      name: string;
      start_time: string;
      end_time: string;
      tolerance_minutes: number;
      days: string;
      is_active: number;
      custom_hours: string;
    }>
  > {
    try {
      const data = (await this._fetch(`${this.baseUrl}/storage/shifts`)) as {
        shifts?: Array<Record<string, unknown>>;
      };
      return (data.shifts || []) as Array<{
        id: number;
        name: string;
        start_time: string;
        end_time: string;
        tolerance_minutes: number;
        days: string;
        is_active: number;
        custom_hours: string;
      }>;
    } catch {
      return [];
    }
  }

  /**
   * Fetch shift assignments (employee → shift mapping) from the remote plant.
   * GET /api/storage/shift-assignments
   */
  async fetchShiftAssignments(): Promise<
    Array<{
      employee_id: string;
      shift_id: number;
      shift_name: string;
      start_time: string;
      end_time: string;
      days: string;
      start_date: string;
      end_date: string | null;
      active: number;
    }>
  > {
    try {
      const data = (await this._fetch(
        `${this.baseUrl}/storage/shift-assignments`,
      )) as { assignments?: Array<Record<string, unknown>> };
      return (data.assignments || []) as Array<{
        employee_id: string;
        shift_id: number;
        shift_name: string;
        start_time: string;
        end_time: string;
        days: string;
        start_date: string;
        end_date: string | null;
        active: number;
      }>;
    } catch {
      return [];
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await this._secureFetch(
        `${this.baseUrl}/barcode-entries?page=1&limit=1`,
        {
          method: 'GET',
          signal: controller.signal,
          headers: this._getHeaders(),
        },
      );

      clearTimeout(timeout);

      if (response.ok) {
        const data = (await response.json()) as {
          pagination?: { total?: number };
        };
        return {
          success: true,
          message: `Conexión exitosa. ${data.pagination?.total || 0} registros disponibles.`,
          details: {
            status: response.status,
            totalRecords: data.pagination?.total || 0,
          },
        };
      }

      return {
        success: false,
        message: `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error: unknown) {
      const err = error as Error & { name: string };
      return {
        success: false,
        message:
          err.name === 'AbortError'
            ? 'Timeout: No se pudo conectar en 5 segundos'
            : `Error de conexión: ${err.message}`,
      };
    }
  }
}
