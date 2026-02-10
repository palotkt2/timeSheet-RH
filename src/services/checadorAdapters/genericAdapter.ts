import type {
  Plant,
  AdapterEntry,
  ConnectionTestResult,
  FieldMapping,
} from '@/types';
import { BaseAdapter } from './baseAdapter';

/**
 * Generic adapter for unknown/configurable time clock APIs.
 * Uses field mapping configuration to transform any API response
 * into the standard format.
 */
export class GenericAdapter extends BaseAdapter {
  private mapping: FieldMapping;

  constructor(plantConfig: Plant) {
    super(plantConfig);
    this.mapping = this._parseMapping(plantConfig.field_mapping);
  }

  private _parseMapping(fieldMappingStr: string | null): FieldMapping {
    const defaults: FieldMapping = {
      endpoint: '/api/barcode-entries',
      method: 'GET',
      dateParamStart: 'startDate',
      dateParamEnd: 'endDate',
      dateFormat: 'YYYY-MM-DD',
      responseDataPath: 'data',
      fields: {
        employee_number: 'barcode',
        timestamp: 'timestamp',
        action: 'action',
      },
      actionValues: {
        entry: ['Entrada', 'IN', '1', 'entrada', 'Entry', 'in', 'E'],
        exit: ['Salida', 'OUT', '0', 'salida', 'Exit', 'out', 'S'],
      },
      pagination: {
        enabled: false,
        pageParam: 'page',
        limitParam: 'limit',
        limitValue: 500,
      },
    };

    if (!fieldMappingStr) return defaults;

    try {
      const parsed = JSON.parse(fieldMappingStr) as Partial<FieldMapping>;
      return {
        ...defaults,
        ...parsed,
        fields: { ...defaults.fields, ...(parsed.fields || {}) },
        actionValues: {
          ...defaults.actionValues,
          ...(parsed.actionValues || {}),
        },
        pagination: { ...defaults.pagination, ...(parsed.pagination || {}) },
      };
    } catch (e) {
      console.error('Error parsing field mapping:', e);
      return defaults;
    }
  }

  private _getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    if (!path) return obj;
    return path.split('.').reduce((current: unknown, key: string) => {
      return current &&
        typeof current === 'object' &&
        (current as Record<string, unknown>)[key] !== undefined
        ? (current as Record<string, unknown>)[key]
        : null;
    }, obj);
  }

  private _normalizeAction(value: unknown): 'Entrada' | 'Salida' {
    const strValue = String(value).trim();

    if (
      this.mapping.actionValues.entry.some(
        (v) => String(v).toLowerCase() === strValue.toLowerCase(),
      )
    ) {
      return 'Entrada';
    }

    if (
      this.mapping.actionValues.exit.some(
        (v) => String(v).toLowerCase() === strValue.toLowerCase(),
      )
    ) {
      return 'Salida';
    }

    const lower = strValue.toLowerCase();
    if (
      lower.includes('in') ||
      lower.includes('entry') ||
      lower.includes('entrada') ||
      lower === '1'
    ) {
      return 'Entrada';
    }
    if (
      lower.includes('out') ||
      lower.includes('exit') ||
      lower.includes('salida') ||
      lower === '0'
    ) {
      return 'Salida';
    }

    return 'Entrada';
  }

  async fetchEntries(
    startDate: string,
    endDate: string,
  ): Promise<AdapterEntry[]> {
    const { endpoint, method, dateParamStart, dateParamEnd, pagination } =
      this.mapping;
    const entries: AdapterEntry[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = new URL(`${this.baseUrl.replace(/\/api$/, '')}${endpoint}`);

      if (dateParamStart) url.searchParams.set(dateParamStart, startDate);
      if (dateParamEnd) url.searchParams.set(dateParamEnd, endDate);

      if (pagination.enabled) {
        url.searchParams.set(pagination.pageParam, String(page));
        url.searchParams.set(
          pagination.limitParam,
          String(pagination.limitValue),
        );
      }

      const data = await this._fetch(url.toString(), { method });

      const records = this._getNestedValue(
        data,
        this.mapping.responseDataPath,
      ) as Record<string, unknown>[] | null;

      if (!records || !Array.isArray(records) || records.length === 0) {
        hasMore = false;
        break;
      }

      for (const record of records) {
        const empNumber = this._getNestedValue(
          record,
          this.mapping.fields.employee_number,
        );
        const timestamp = this._getNestedValue(
          record,
          this.mapping.fields.timestamp,
        );
        const actionRaw = this._getNestedValue(
          record,
          this.mapping.fields.action,
        );

        if (empNumber && timestamp) {
          const entryDate = String(timestamp).split('T')[0];
          if (entryDate >= startDate && entryDate <= endDate) {
            entries.push({
              employee_number: String(empNumber),
              timestamp: String(timestamp),
              action: this._normalizeAction(actionRaw),
              raw: record,
            });
          }
        }
      }

      if (!pagination.enabled || records.length < pagination.limitValue) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return entries;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const { endpoint } = this.mapping;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const url = `${this.baseUrl.replace(/\/api$/, '')}${endpoint}`;
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: this._getHeaders(),
      });

      clearTimeout(timeout);

      return {
        success: response.ok,
        message: response.ok
          ? 'Conexión exitosa al checador'
          : `HTTP ${response.status}: ${response.statusText}`,
        details: { status: response.status },
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
