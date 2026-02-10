import Database from 'better-sqlite3';
import { createHash, randomBytes } from 'crypto';

/**
 * Base de datos principal (barcode_entries.db).
 * Contiene información de empleados, turnos, asignaciones, checadas y usuarios.
 */

/** Simple password hashing with salt (SHA-256) */
export function hashPassword(
  password: string,
  salt?: string,
): { hash: string; salt: string } {
  const s = salt ?? randomBytes(16).toString('hex');
  const hash = createHash('sha256')
    .update(s + password)
    .digest('hex');
  return { hash, salt: s };
}

export function verifyPassword(
  password: string,
  storedHash: string,
  salt: string,
): boolean {
  const { hash } = hashPassword(password, salt);
  return hash === storedHash;
}

let db: Database.Database | null = null;

export function initDB(): Database.Database {
  if (!db) {
    db = new Database('./barcode_entries.db', { fileMustExist: false });
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
      CREATE TABLE IF NOT EXISTS employee_shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_number TEXT NOT NULL,
        employee_name TEXT,
        employee_role TEXT,
        department TEXT,
        shift_type TEXT,
        created_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        start_time TEXT NOT NULL DEFAULT '06:00',
        end_time TEXT NOT NULL DEFAULT '15:30',
        tolerance_minutes INTEGER DEFAULT 15,
        days TEXT DEFAULT '[1,2,3,4,5]',
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
        updated_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS shift_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT NOT NULL,
        shift_id INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT,
        active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS barcode_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barcode TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
        UNIQUE(barcode, timestamp)
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_es_employee ON employee_shifts(employee_number);
      CREATE INDEX IF NOT EXISTS idx_sa_employee ON shift_assignments(employee_id);
      CREATE INDEX IF NOT EXISTS idx_sa_shift ON shift_assignments(shift_id);
      CREATE INDEX IF NOT EXISTS idx_sa_active ON shift_assignments(active);
      CREATE INDEX IF NOT EXISTS idx_be_barcode ON barcode_entries(barcode);
      CREATE INDEX IF NOT EXISTS idx_be_timestamp ON barcode_entries(timestamp);
      CREATE INDEX IF NOT EXISTS idx_be_action ON barcode_entries(action);
    `);

    const shiftCount = db
      .prepare('SELECT COUNT(*) as count FROM shifts')
      .get() as { count: number };
    if (shiftCount.count === 0) {
      db.prepare(
        `
        INSERT INTO shifts (id, name, start_time, end_time, tolerance_minutes, days)
        VALUES (1, 'Turno Matutino', '06:00', '15:30', 15, '[1,2,3,4,5]')
      `,
      ).run();
    }

    // ── Users table ───────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin','supervisor','viewer')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT (datetime('now','localtime')),
        updated_at TIMESTAMP DEFAULT (datetime('now','localtime'))
      )
    `);

    // Seed default admin user (admin / admin)
    const userCount = db
      .prepare('SELECT COUNT(*) as count FROM users')
      .get() as { count: number };
    if (userCount.count === 0) {
      const { hash, salt } = hashPassword('admin');
      db.prepare(
        `INSERT INTO users (username, password_hash, password_salt, name, role)
         VALUES ('admin', ?, ?, 'Administrador', 'admin')`,
      ).run(hash, salt);
    }
  }
  return db;
}

export function getDB(): Database.Database {
  if (!db) {
    initDB();
  }
  return db!;
}
