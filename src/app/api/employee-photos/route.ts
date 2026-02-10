import { NextResponse } from 'next/server';
import { existsSync, readdirSync } from 'fs';
import path from 'path';

const PHOTOS_BASE = path.join(process.cwd(), 'data', 'employee-photos');
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * GET /api/employee-photos
 * Returns a list of employee numbers that have photos on file.
 */
export async function GET() {
  try {
    if (!existsSync(PHOTOS_BASE)) {
      return NextResponse.json({ success: true, employees: [] });
    }

    const dirs = readdirSync(PHOTOS_BASE, { withFileTypes: true });
    const employeesWithPhotos: string[] = [];

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      const empDir = path.join(PHOTOS_BASE, dir.name);
      try {
        const files = readdirSync(empDir);
        const hasPhoto = files.some((f) =>
          ALLOWED_EXTENSIONS.includes(path.extname(f).toLowerCase()),
        );
        if (hasPhoto) {
          employeesWithPhotos.push(dir.name);
        }
      } catch {
        // skip unreadable dirs
      }
    }

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
