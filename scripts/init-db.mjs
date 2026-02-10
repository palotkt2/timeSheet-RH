/**
 * Script para inicializar las bases de datos del sistema multi-planta.
 * Crea:
 *   1. barcode_entries.db — Empleados, turnos, asignaciones y checadas locales
 *   2. multi_plant.db     — Plantas remotas y checadas consolidadas
 *
 * Uso: node scripts/init-db.mjs
 */

import Database from 'better-sqlite3';
import { existsSync } from 'fs';

console.log('=== Inicializando bases de datos ===\n');

// ─── 1. barcode_entries.db ────────────────────────────────────────────
const existed1 = existsSync('./barcode_entries.db');
const mainDb = new Database('./barcode_entries.db');
mainDb.pragma('journal_mode = WAL');
mainDb.pragma('foreign_keys = ON');

mainDb.exec(`
  CREATE TABLE IF NOT EXISTS employee_shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_number TEXT NOT NULL,
    employee_name TEXT,
    employee_role TEXT,
    department TEXT,
    shift_type TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

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
  );

  CREATE TABLE IF NOT EXISTS shift_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    shift_id INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    active INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS barcode_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(barcode, timestamp)
  );

  CREATE INDEX IF NOT EXISTS idx_es_employee ON employee_shifts(employee_number);
  CREATE INDEX IF NOT EXISTS idx_sa_employee ON shift_assignments(employee_id);
  CREATE INDEX IF NOT EXISTS idx_sa_shift ON shift_assignments(shift_id);
  CREATE INDEX IF NOT EXISTS idx_sa_active ON shift_assignments(active);
  CREATE INDEX IF NOT EXISTS idx_be_barcode ON barcode_entries(barcode);
  CREATE INDEX IF NOT EXISTS idx_be_timestamp ON barcode_entries(timestamp);
  CREATE INDEX IF NOT EXISTS idx_be_action ON barcode_entries(action);
`);

// Turno por defecto
const shiftCount = mainDb.prepare('SELECT COUNT(*) as count FROM shifts').get();
if (shiftCount.count === 0) {
  mainDb
    .prepare(
      `
    INSERT INTO shifts (id, name, start_time, end_time, tolerance_minutes, days)
    VALUES (1, 'Turno Matutino', '06:00', '15:30', 15, '[1,2,3,4,5]')
  `,
    )
    .run();
  console.log('  ✔ Turno Matutino por defecto creado');
}

mainDb.close();
console.log(`  ✔ barcode_entries.db ${existed1 ? '(ya existía)' : 'creada'}`);
console.log('    Tablas: employee_shifts, shifts, shift_assignments, barcode_entries\n');

// ─── 2. multi_plant.db ───────────────────────────────────────────────
const existed2 = existsSync('./multi_plant.db');
const mpDb = new Database('./multi_plant.db');
mpDb.pragma('journal_mode = WAL');
mpDb.pragma('foreign_keys = ON');

mpDb.exec(`
  CREATE TABLE IF NOT EXISTS plants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    port INTEGER DEFAULT 3000,
    api_base_path TEXT DEFAULT '/api',
    adapter_type TEXT DEFAULT 'generic',
    auth_token TEXT,
    field_mapping TEXT,
    is_active INTEGER DEFAULT 1,
    last_sync TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS plant_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plant_id INTEGER NOT NULL,
    employee_number TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    action TEXT NOT NULL,
    raw_data TEXT,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE,
    UNIQUE(plant_id, employee_number, timestamp)
  );

  CREATE INDEX IF NOT EXISTS idx_pe_employee ON plant_entries(employee_number);
  CREATE INDEX IF NOT EXISTS idx_pe_timestamp ON plant_entries(timestamp);
  CREATE INDEX IF NOT EXISTS idx_pe_plant ON plant_entries(plant_id);
  CREATE INDEX IF NOT EXISTS idx_pe_emp_ts ON plant_entries(employee_number, timestamp);
`);

mpDb.close();
console.log(`  ✔ multi_plant.db ${existed2 ? '(ya existía)' : 'creada'}`);
console.log('    Tablas: plants, plant_entries\n');

console.log('=== Bases de datos listas ===');
