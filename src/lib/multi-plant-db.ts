import Database from 'better-sqlite3';

/**
 * Base de datos separada para el consolidador multi-planta.
 * Archivo: multi_plant.db
 */

let mpDb: Database.Database | null = null;

export function getMultiPlantDB(): Database.Database {
  if (!mpDb) {
    mpDb = new Database('./multi_plant.db', { fileMustExist: false });
    mpDb.pragma('foreign_keys = ON');
    mpDb.pragma('journal_mode = WAL');

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
        use_https INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        last_sync TEXT,
        created_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
        updated_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // Migration: add use_https column if it doesn't exist yet
    try {
      mpDb.exec(`ALTER TABLE plants ADD COLUMN use_https INTEGER DEFAULT 0`);
    } catch {
      // Column already exists — ignore
    }

    mpDb.exec(`
      CREATE TABLE IF NOT EXISTS plant_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plant_id INTEGER NOT NULL,
        employee_number TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        raw_data TEXT,
        synced_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
        created_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (plant_id) REFERENCES plants(id) ON DELETE CASCADE,
        UNIQUE(plant_id, employee_number, timestamp)
      )
    `);

    mpDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_pe_employee ON plant_entries(employee_number);
      CREATE INDEX IF NOT EXISTS idx_pe_timestamp ON plant_entries(timestamp);
      CREATE INDEX IF NOT EXISTS idx_pe_plant ON plant_entries(plant_id);
      CREATE INDEX IF NOT EXISTS idx_pe_emp_ts ON plant_entries(employee_number, timestamp);
      CREATE INDEX IF NOT EXISTS idx_pe_date ON plant_entries(date(timestamp));
    `);

    mpDb.exec(`
      CREATE TABLE IF NOT EXISTS employee_names (
        employee_number TEXT PRIMARY KEY,
        employee_name TEXT NOT NULL,
        employee_role TEXT,
        department TEXT,
        source_plant_id INTEGER,
        updated_at TIMESTAMP DEFAULT (datetime('now', 'localtime'))
      )
    `);

    mpDb.exec(`
      CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_plant_id INTEGER NOT NULL,
        remote_shift_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        tolerance_minutes INTEGER DEFAULT 0,
        days TEXT DEFAULT '[1,2,3,4,5]',
        is_active INTEGER DEFAULT 1,
        custom_hours TEXT DEFAULT '{}',
        synced_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
        UNIQUE(source_plant_id, remote_shift_id)
      )
    `);

    mpDb.exec(`
      CREATE TABLE IF NOT EXISTS shift_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_number TEXT NOT NULL,
        shift_id INTEGER NOT NULL,
        shift_name TEXT,
        start_time TEXT,
        end_time TEXT,
        days TEXT,
        start_date TEXT,
        end_date TEXT,
        active INTEGER DEFAULT 1,
        source_plant_id INTEGER NOT NULL,
        synced_at TIMESTAMP DEFAULT (datetime('now', 'localtime')),
        UNIQUE(employee_number, source_plant_id)
      )
    `);

    mpDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_sa_employee ON shift_assignments(employee_number);
      CREATE INDEX IF NOT EXISTS idx_sa_shift ON shift_assignments(shift_id);
    `);
  }

  return mpDb;
}

export function closeMultiPlantDB(): void {
  if (mpDb) {
    mpDb.close();
    mpDb = null;
  }
}
