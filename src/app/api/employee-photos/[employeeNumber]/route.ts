import { NextResponse, NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';
import { findLatestPhoto, findPhotosForDate } from '@/lib/photo-storage';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * GET /api/employee-photos/[employeeNumber]
 * Query params:
 *   ?date=YYYY-MM-DD — specific date
 *   ?type=entry|exit  — entry or exit photo (default: entry)
 * Without date param, returns the latest photo for the employee.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ employeeNumber: string }> },
) {
  const { employeeNumber } = await params;
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const type = searchParams.get('type') || 'entry';

  let photoPath: string | null = null;

  if (date) {
    const photos = findPhotosForDate(employeeNumber, date);
    photoPath = type === 'exit' ? photos.exit : photos.entry;
    // Fallback: if requested exit not found, try entry (and vice versa)
    if (!photoPath) {
      photoPath = type === 'exit' ? photos.entry : photos.exit;
    }
  } else {
    photoPath = findLatestPhoto(employeeNumber);
  }

  if (!photoPath) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const buffer = readFileSync(photoPath);
    const ext = path.extname(photoPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'image/jpeg';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}

/**
 * DELETE /api/employee-photos/[employeeNumber]
 * Delete the latest photo for an employee.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ employeeNumber: string }> },
) {
  const { employeeNumber } = await params;
  const photoPath = findLatestPhoto(employeeNumber);

  if (!photoPath) {
    return NextResponse.json(
      { success: false, error: 'No se encontró foto para este empleado' },
      { status: 404 },
    );
  }

  try {
    const { unlinkSync } = await import('fs');
    unlinkSync(photoPath);
    return NextResponse.json({
      success: true,
      message: `Foto eliminada para empleado ${employeeNumber}`,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json(
      { success: false, error: `Error al eliminar foto: ${message}` },
      { status: 500 },
    );
  }
}
