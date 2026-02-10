import { NextResponse } from 'next/server';
import { listEmployeesWithPhotos } from '@/lib/photo-storage';

/**
 * GET /api/employee-photos
 * Returns a list of employee numbers that have photos on file.
 */
export async function GET() {
  try {
    const employeesWithPhotos = listEmployeesWithPhotos();

    return NextResponse.json({
      success: true,
      employees: employeesWithPhotos,
      total: employeesWithPhotos.length,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
