import type { Plant, AdapterEntry, ConnectionTestResult } from '@/types';

export interface RemoteEmployee {
  employee_number: string;
  employee_name: string;
  employee_role: string | null;
  department: string | null;
}

export interface RemoteDepartment {
  code: string;
  name: string;
}

/**
 * Fallback mapping for truncated department codes → full names.
 * Used when /api/departments is not accessible (requires auth).
 */
export const DEPARTMENT_NAME_MAP: Record<string, string> = {
  Alm: 'Almacén',
  alm: 'Almacén',
  car: 'Carritos',
  ch: 'Chofer',
  en: 'Ensamble',
  enf: 'Enfermería',
  ing: 'Ingeniería',
  it: 'Tecnología de la Información',
  mantenimiento: 'Mantenimiento',
  me: 'Mecánica',
  na: 'N/A',
  pin: 'Pintura',
  produccion: 'Producción',
  sol: 'Soldadura',
  administracion: 'Administración',
  contabilidad: 'Contabilidad',
  operaciones: 'Operaciones',
  rh: 'Recursos Humanos',
  seguridad: 'Seguridad',
  ventas: 'Ventas',
};

/**
 * Resolves a department code to its full name using:
 * 1. Dynamic mapping from remote /api/departments (if provided)
 * 2. Static fallback map
 * 3. Original value if no mapping found
 */
export function resolveDepartmentName(
  code: string | null | undefined,
  dynamicMap?: Record<string, string>,
): string | null {
  if (!code) return null;
  // Already a full name (longer than typical abbreviation)
  if (dynamicMap?.[code]) return dynamicMap[code];
  if (DEPARTMENT_NAME_MAP[code]) return DEPARTMENT_NAME_MAP[code];
  return code;
}

/**
 * Base adapter for time clock (checador) APIs.
 * All adapters must implement the fetchEntries method.
 */
export abstract class BaseAdapter {
  protected config: Plant;
  protected baseUrl: string;

  constructor(plantConfig: Plant) {
    this.config = plantConfig;
    const protocol = plantConfig.use_https ? 'https' : 'http';
    this.baseUrl = `${protocol}://${plantConfig.ip_address}:${plantConfig.port}${plantConfig.api_base_path || ''}`;
  }

  abstract fetchEntries(
    startDate: string,
    endDate: string,
  ): Promise<AdapterEntry[]>;

  /**
   * Fetch employee names/info from the remote plant.
   * @param employeeNumbers - optional list of employee numbers to look up.
   * Returns only employees with real names (not placeholders).
   */
  async fetchEmployeeNames(
    employeeNumbers?: string[],
  ): Promise<RemoteEmployee[]> {
    void employeeNumbers;
    return [];
  }

  /**
   * Fetch department list from the remote plant.
   * Returns a code→name map for resolving truncated department names.
   */
  async fetchDepartments(): Promise<Record<string, string>> {
    return {};
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await this._secureFetch(this.baseUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: this._getHeaders(),
      });

      clearTimeout(timeout);

      return {
        success: response.ok,
        message: response.ok
          ? 'Conexión exitosa'
          : `HTTP ${response.status}: ${response.statusText}`,
        details: {
          status: response.status,
          statusText: response.statusText,
        },
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

  protected _getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.auth_token) {
      headers['Authorization'] = `Bearer ${this.config.auth_token}`;
    }
    return headers;
  }

  /**
   * Performs a fetch that works with self-signed HTTPS certificates.
   * Node.js native fetch (undici) doesn't support http.Agent,
   * so we temporarily disable TLS rejection for HTTPS plant connections.
   */
  protected async _secureFetch(
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const prevTLS = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    try {
      if (this.config.use_https) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      }
      return await fetch(url, init);
    } finally {
      // Restore original value
      if (this.config.use_https) {
        if (prevTLS === undefined) {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        } else {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTLS;
        }
      }
    }
  }

  protected async _fetch(
    url: string,
    options: RequestInit = {},
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await this._secureFetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...this._getHeaders(),
          ...((options.headers as Record<string, string>) || {}),
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as Record<string, unknown>;
    } catch (error: unknown) {
      clearTimeout(timeout);
      const err = error as Error & { name: string };
      if (err.name === 'AbortError') {
        throw new Error('Timeout: La solicitud tardó más de 30 segundos');
      }
      throw error;
    }
  }
}
