import Database from 'better-sqlite3';
import { randomBytes, pbkdf2Sync } from 'crypto';

/**
 * Base de datos principal (barcode_entries.db).
 * Contiene información de empleados, turnos, asignaciones y checadas locales.
 */

let db: Database.Database | null = null;

// ─── Password hashing helpers ──────────────────────────────────

const HASH_ITERATIONS = 100_000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = 'sha512';

/**
 * Hash a plain-text password with a random salt.
 */
export function hashPassword(password: string): {
  hash: string;
  salt: string;
} {
  const salt = randomBytes(32).toString('hex');
  const hash = pbkdf2Sync(
    password,
    salt,
    HASH_ITERATIONS,
    HASH_KEYLEN,
    HASH_DIGEST,
  ).toString('hex');
  return { hash, salt };
}

/**
 * Verify a password against a stored hash + salt.
 */
export function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
): boolean {
  const hash = pbkdf2Sync(
    password,
    storedSalt,
    HASH_ITERATIONS,
    HASH_KEYLEN,
    HASH_DIGEST,
  ).toString('hex');
  return hash === storedHash;
}

// ─── Database initialization ───────────────────────────────────

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
      )
    `);

    // ── Users table ──────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT (datetime('now','localtime')),
        updated_at TIMESTAMP DEFAULT (datetime('now','localtime'))
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_es_employee ON employee_shifts(employee_number);
      CREATE INDEX IF NOT EXISTS idx_sa_employee ON shift_assignments(employee_id);
      CREATE INDEX IF NOT EXISTS idx_sa_shift ON shift_assignments(shift_id);
      CREATE INDEX IF NOT EXISTS idx_sa_active ON shift_assignments(active);
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

    // ── Default admin user (admin / admin) if no users exist ──
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
