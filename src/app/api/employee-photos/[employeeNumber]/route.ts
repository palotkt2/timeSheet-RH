import { NextResponse, NextRequest } from 'next/server';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from 'fs';
import path from 'path';

const PHOTOS_BASE = path.join(process.cwd(), 'data', 'employee-photos');
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Find the photo file for an employee (checks multiple extensions).
 */
function findPhotoPath(employeeNumber: string): string | null {
  const empDir = path.join(PHOTOS_BASE, employeeNumber);
  if (!existsSync(empDir)) return null;

  for (const ext of ALLOWED_EXTENSIONS) {
    const filePath = path.join(empDir, `foto${ext}`);
    if (existsSync(filePath)) return filePath;
  }

  // Also check for any image file in the folder
  try {
    const files = readdirSync(empDir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ALLOWED_EXTENSIONS.includes(ext)) {
        return path.join(empDir, file);
      }
    }
  } catch {
    // ignore
  }

  return null;
}

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * GET /api/employee-photos/[employeeNumber]
 * Returns the employee photo or 404 if not found.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ employeeNumber: string }> },
) {
  const { employeeNumber } = await params;
  const photoPath = findPhotoPath(employeeNumber);

  if (!photoPath) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const buffer = readFileSync(photoPath);
    const ext = path.extname(photoPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}

/**
 * POST /api/employee-photos/[employeeNumber]
 * Upload a photo for an employee. Expects multipart/form-data with a "photo" field.
 * Saves to: data/employee-photos/{employeeNumber}/foto.{ext}
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ employeeNumber: string }> },
) {
  const { employeeNumber } = await params;

  try {
    const formData = await request.formData();
    const file = formData.get('photo') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No se envió ninguna foto' },
        { status: 400 },
      );
    }

    // Validate file type
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        {
          success: false,
          error: `Tipo de archivo no permitido. Usar: ${ALLOWED_EXTENSIONS.join(', ')}`,
        },
        { status: 400 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'El archivo excede 5 MB' },
        { status: 400 },
      );
    }

    // Create directory: data/employee-photos/{employeeNumber}/
    const empDir = path.join(PHOTOS_BASE, employeeNumber);
    mkdirSync(empDir, { recursive: true });

    // Remove any existing photo files
    if (existsSync(empDir)) {
      try {
        const files = readdirSync(empDir);
        for (const f of files) {
          const fExt = path.extname(f).toLowerCase();
          if (ALLOWED_EXTENSIONS.includes(fExt)) {
            const { unlinkSync } = await import('fs');
            unlinkSync(path.join(empDir, f));
          }
        }
      } catch {
        // ignore cleanup errors
      }
    }

    // Save the new photo
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const savePath = path.join(empDir, `foto${ext}`);
    writeFileSync(savePath, buffer);

    return NextResponse.json({
      success: true,
      message: `Foto guardada para empleado ${employeeNumber}`,
      path: `data/employee-photos/${employeeNumber}/foto${ext}`,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json(
      { success: false, error: `Error al guardar foto: ${message}` },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/employee-photos/[employeeNumber]
 * Delete the photo for an employee.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ employeeNumber: string }> },
) {
  const { employeeNumber } = await params;
  const photoPath = findPhotoPath(employeeNumber);

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
