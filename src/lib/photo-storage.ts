/**
 * Utility module for saving and retrieving employee photos on disk.
 *
 * Storage structure:
 *   data/employee-photos/{employee_number}/{YYYY-MM-DD}_{Entrada|Salida}.jpg
 *
 * This keeps photos organized by employee and date, with entry/exit distinction.
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';

const PHOTOS_BASE = path.join(process.cwd(), 'data', 'employee-photos');

/**
 * Sanitize an employee number to prevent path traversal.
 * Only allows digits (and leading zeros). Strips everything else.
 */
function sanitizeEmployeeNumber(empNum: string): string {
  const safe = empNum.replace(/[^0-9]/g, '');
  if (!safe) throw new Error(`Invalid employee number: ${empNum}`);
  return safe;
}

/**
 * Save a photo from a barcode entry to disk.
 * @param employeeNumber - Employee number (folder name)
 * @param timestamp - Entry timestamp like "2026-02-10T06:08:42.887"
 * @param action - "Entrada" or "Salida"
 * @param photoData - Base64 data URI or raw base64 string
 */
export function saveEntryPhoto(
  employeeNumber: string,
  timestamp: string,
  action: string,
  photoData: string,
): string {
  employeeNumber = sanitizeEmployeeNumber(employeeNumber);
  const dateStr = timestamp.split('T')[0]; // "2026-02-10"
  const cleanAction = (action || 'Entrada').replace(/\s+/g, '_');

  // Create directory: data/employee-photos/{employeeNumber}/
  const empDir = path.join(PHOTOS_BASE, employeeNumber);
  mkdirSync(empDir, { recursive: true });

  // Decode base64
  let base64 = photoData;
  if (base64.startsWith('data:')) {
    base64 = base64.split(',')[1];
  }
  const buffer = Buffer.from(base64, 'base64');

  // Save: {date}_{action}.jpg
  const fileName = `${dateStr}_${cleanAction}.jpg`;
  const filePath = path.join(empDir, fileName);
  writeFileSync(filePath, buffer);

  return filePath;
}

/**
 * Find the latest photo for an employee (most recent date, preferring Entrada).
 */
export function findLatestPhoto(employeeNumber: string): string | null {
  employeeNumber = sanitizeEmployeeNumber(employeeNumber);
  const empDir = path.join(PHOTOS_BASE, employeeNumber);
  if (!existsSync(empDir)) return null;

  try {
    const files = readdirSync(empDir)
      .filter(
        (f) => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'),
      )
      .sort()
      .reverse(); // Most recent date first

    // Prefer the latest Entrada photo
    const entryPhoto = files.find((f) => f.includes('_Entrada'));
    if (entryPhoto) return path.join(empDir, entryPhoto);

    // Fallback to any photo
    if (files.length > 0) return path.join(empDir, files[0]);
  } catch {
    // ignore
  }

  return null;
}

/**
 * Find entry and exit photos for a specific employee on a specific date.
 */
export function findPhotosForDate(
  employeeNumber: string,
  date: string, // "YYYY-MM-DD"
): { entry: string | null; exit: string | null } {
  employeeNumber = sanitizeEmployeeNumber(employeeNumber);
  const empDir = path.join(PHOTOS_BASE, employeeNumber);
  if (!existsSync(empDir)) return { entry: null, exit: null };

  try {
    const files = readdirSync(empDir);
    const entryFile = files.find((f) => f.startsWith(`${date}_Entrada`));
    const exitFile = files.find((f) => f.startsWith(`${date}_Salida`));

    return {
      entry: entryFile ? path.join(empDir, entryFile) : null,
      exit: exitFile ? path.join(empDir, exitFile) : null,
    };
  } catch {
    return { entry: null, exit: null };
  }
}

/**
 * Check whether the photo file for a given entry already exists on disk.
 */
export function entryPhotoExists(
  employeeNumber: string,
  timestamp: string,
  action: string,
): boolean {
  try {
    employeeNumber = sanitizeEmployeeNumber(employeeNumber);
    const dateStr = timestamp.split('T')[0];
    const cleanAction = (action || 'Entrada').replace(/\s+/g, '_');
    const fileName = `${dateStr}_${cleanAction}.jpg`;
    const filePath = path.join(PHOTOS_BASE, employeeNumber, fileName);
    return existsSync(filePath);
  } catch {
    return false;
  }
}

/**
 * List all employees that have at least one photo on disk.
 */
export function listEmployeesWithPhotos(): string[] {
  if (!existsSync(PHOTOS_BASE)) return [];
  // Note: this function reads directory names directly, which are already
  // sanitized numerics created by saveEntryPhoto. No user input involved.

  try {
    return readdirSync(PHOTOS_BASE, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((empNum) => {
        const empDir = path.join(PHOTOS_BASE, empNum);
        try {
          const files = readdirSync(empDir);
          return files.some(
            (f) =>
              f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'),
          );
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}
