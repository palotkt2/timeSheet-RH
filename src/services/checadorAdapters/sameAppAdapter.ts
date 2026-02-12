import type { Plant, AdapterEntry, ConnectionTestResult } from '@/types';
import {
  BaseAdapter,
  RemoteEmployee,
  resolveDepartmentName,
} from './baseAdapter';

/**
 * Adapter for remote instances that run the same Next.js app.
 * Consumes /api/barcode-entries endpoint with the same format.
 * Supports cookie-based auth via /api/auth/login for protected endpoints.
 */
export class SameAppAdapter extends BaseAdapter {
  /** Cached auth cookie (e.g. "auth-token=eyJ...") */
  private _authCookie: string | null = null;
  /** Timestamp when cookie was obtained (for expiry) */
  private _authCookieTime = 0;
  /** Cookie TTL: 50 minutes (server issues 60 min tokens) */
  private static readonly COOKIE_TTL_MS = 50 * 60 * 1000;

  constructor(plantConfig: Plant) {
    super(plantConfig);
  }

  /**
   * Login to the remote plant and cache the auth cookie.
   * Only works if auth_email & auth_password are configured on the plant.
   * Returns the cookie string or null if login failed/not configured.
   */
  private async _login(): Promise<string | null> {
    if (!this.config.auth_email || !this.config.auth_password) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await this._secureFetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.config.auth_email,
          password: this.config.auth_password,
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      // Extract auth-token cookie from Set-Cookie header
      const setCookies = response.headers.getSetCookie?.() ?? [];
      for (const cookie of setCookies) {
        if (cookie.startsWith('auth-token=')) {
          const tokenPart = cookie.split(';')[0]; // "auth-token=eyJ..."
          this._authCookie = tokenPart;
          this._authCookieTime = Date.now();
          return tokenPart;
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Get a valid auth cookie, using cache if fresh or logging in again.
   */
  private async _getAuthCookie(): Promise<string | null> {
    if (
      this._authCookie &&
      Date.now() - this._authCookieTime < SameAppAdapter.COOKIE_TTL_MS
    ) {
      return this._authCookie;
    }
    return this._login();
  }

  /**
   * Fetch with automatic 401 retry: if request fails with 401,
   * login and retry once with the auth cookie.
   */
  protected async _fetchWithAuth(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const doFetch = async (cookie: string | null) => {
      const headers = {
        ...this._getHeaders(),
        ...((options.headers as Record<string, string>) || {}),
      };
      if (cookie) {
        headers['Cookie'] = cookie;
      }
      return this._secureFetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
    };

    try {
      let response = await doFetch(await this._getAuthCookie());

      if (
        response.status === 401 &&
        this.config.auth_email &&
        this.config.auth_password
      ) {
        const cookie = await this._login();
        if (cookie) {
          response = await doFetch(cookie);
        }
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Override base _fetch to include auth cookies on every request.
   * If a 401 is returned and credentials are configured, auto-login and retry.
   */
  protected override async _fetch(
    url: string,
    options: RequestInit = {},
  ): Promise<Record<string, unknown>> {
    const response = await this._fetchWithAuth(url, options);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as Record<string, unknown>;
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
        // Extract photo separately so it's not stored in raw_data JSON
        const rawEntry = { ...(entry as Record<string, unknown>) };
        const photo =
          typeof rawEntry.photo === 'string'
            ? (rawEntry.photo as string)
            : undefined;
        delete rawEntry.photo;

        entries.push({
          employee_number: String(entry.barcode),
          timestamp: entry.timestamp,
          action: entry.action || 'Entrada',
          raw: rawEntry,
          photo,
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
   * Returns a code→name map. Auto-authenticates if plant has credentials.
   */
  async fetchDepartments(): Promise<Record<string, string>> {
    try {
      const response = await this._fetchWithAuth(
        `${this.baseUrl}/departments`,
        {
          method: 'GET',
        },
      );
      if (!response.ok) return {};
      const body = await response.json();
      const departments = (
        Array.isArray(body)
          ? body
          : (body as Record<string, unknown>).departments || []
      ) as Array<{
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

  /**
   * Register an employee on the remote plant.
   * POST /api/employee-shifts → { employee_number, employee_name, employee_role, department, date }
   */
  async registerEmployee(employee: {
    employee_number: string;
    employee_name: string;
    employee_role: string;
    department: string;
    date: string;
  }): Promise<{ success: boolean; remoteId?: number; message?: string }> {
    try {
      const data = (await this._fetch(`${this.baseUrl}/employee-shifts`, {
        method: 'POST',
        body: JSON.stringify(employee),
      })) as {
        success?: boolean;
        shift?: { id: number };
        message?: string;
        error?: string;
      };

      if (data.success) {
        return {
          success: true,
          remoteId: data.shift?.id,
          message: data.message,
        };
      }
      return {
        success: false,
        message: data.error || data.message || 'Error desconocido',
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error de conexión';
      return { success: false, message: msg };
    }
  }

  /**
   * Assign a shift to an employee on the remote plant.
   * POST /api/storage/shift-assignments → { employee_id, shift_id, start_date, active }
   */
  async assignShift(assignment: {
    employee_id: string;
    shift_id: number;
    start_date: string;
  }): Promise<{ success: boolean; message?: string }> {
    try {
      const data = (await this._fetch(
        `${this.baseUrl}/storage/shift-assignments`,
        {
          method: 'POST',
          body: JSON.stringify({ ...assignment, active: 1 }),
        },
      )) as { success?: boolean; message?: string; error?: string };

      if (data.success) {
        return { success: true, message: data.message };
      }
      return {
        success: false,
        message: data.error || data.message || 'Error desconocido',
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error de conexión';
      return { success: false, message: msg };
    }
  }

  /**
   * Create a new department on the remote plant.
   * POST /api/departments → { code, name, description }
   * Auto-authenticates if plant has credentials.
   */
  async createDepartment(dept: {
    code: string;
    name: string;
    description?: string;
  }): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await this._fetchWithAuth(
        `${this.baseUrl}/departments`,
        {
          method: 'POST',
          body: JSON.stringify(dept),
        },
      );
      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (data.success) {
        return { success: true, message: data.message };
      }
      return {
        success: false,
        message: data.error || data.message || 'Error desconocido',
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error de conexión';
      return { success: false, message: msg };
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const cookie = await this._getAuthCookie();
      const headers = this._getHeaders();
      if (cookie) headers['Cookie'] = cookie;

      const response = await this._secureFetch(
        `${this.baseUrl}/barcode-entries?page=1&limit=1`,
        {
          method: 'GET',
          signal: controller.signal,
          headers,
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
