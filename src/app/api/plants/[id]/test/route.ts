import { NextResponse, NextRequest } from 'next/server';
import { getMultiPlantDB } from '@/lib/multi-plant-db';
import { createAdapter } from '@/services/checadorAdapters/adapterFactory';
import type { Plant } from '@/types';

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/plants/[id]/test
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const db = getMultiPlantDB();

    const plant = db.prepare('SELECT * FROM plants WHERE id = ?').get(id) as
      | Plant
      | undefined;
    if (!plant) {
      return NextResponse.json(
        { success: false, error: 'Planta no encontrada' },
        { status: 404 },
      );
    }

    const adapter = createAdapter(plant);
    const result = await adapter.testConnection();

    return NextResponse.json({
      success: result.success,
      plant: plant.name,
      message: result.message,
      details: result.details,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    console.error('Error testing plant connection:', error);
    return NextResponse.json(
      { success: false, error: `Error: ${message}` },
      { status: 500 },
    );
  }
}
