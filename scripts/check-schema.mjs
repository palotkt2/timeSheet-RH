import Database from 'better-sqlite3';
import { existsSync } from 'fs';

// Check barcode_entries.db
if (existsSync('barcode_entries.db')) {
  const db = new Database('barcode_entries.db');
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all();
  console.log('=== barcode_entries.db ===');
  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info('${t.name}')`).all();
    console.log(`  ${t.name}: ${cols.map((c) => c.name).join(', ')}`);
  }
  db.close();
}

// Check multi_plant.db
if (existsSync('multi_plant.db')) {
  const db = new Database('multi_plant.db');
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all();
  console.log('\n=== multi_plant.db ===');
  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info('${t.name}')`).all();
    console.log(`  ${t.name}: ${cols.map((c) => c.name).join(', ')}`);
  }
  // Check if employee_names has any image-related data
  const sample = db.prepare('SELECT * FROM employee_names LIMIT 2').all();
  console.log('\nSample employee_names:', JSON.stringify(sample, null, 2));
  db.close();
}
