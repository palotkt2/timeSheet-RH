import { NextResponse } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';
import { createAdapter } from '@/services/checadorAdapters/adapterFactory';
import { SameAppAdapter } from '@/services/checadorAdapters/sameAppAdapter';
import type { Plant } from '@/types';

export interface DepartmentOption {
  code: string;
  name: string;
}

/**
 * GET /api/multi-plant/departments
 *
 * Aggregates departments from all active plants (checadores).
 * Returns a de-duplicated list sorted alphabetically by name.
 */
export async function GET() {
  try {
    const db = getMultiPlantDB();
    const plants = db
      .prepare('SELECT * FROM plants WHERE is_active = 1')
      .all() as Plant[];

    // Fetch departments from all plants in parallel
    const results = await Promise.allSettled(
      plants.map(async (plant) => {
        const adapter = createAdapter(plant);
        if (!(adapter instanceof SameAppAdapter)) return {};
        return adapter.fetchDepartments();
      }),
    );

    // Merge all code→name maps, de-duplicating by code
    const merged = new Map<string, string>();
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const map = result.value;
        for (const [code, name] of Object.entries(map)) {
          if (!merged.has(code)) {
            merged.set(code, name);
          }
        }
      }
    }

    // Convert to sorted array
    const departments: DepartmentOption[] = Array.from(merged.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    return NextResponse.json({ success: true, departments });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error fetching departments:', error);
    return NextResponse.json(
      { success: false, error: message, departments: [] },
      { status: 500 },
    );
  }
}
