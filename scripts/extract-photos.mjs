/**
 * Migration script: Extract base64 photos from raw_data in plant_entries,
 * save them to data/employee-photos/{employee_number}/{date}_{action}.jpg,
 * then strip the photo from raw_data to shrink the DB.
 *
 * Structure: data/employee-photos/{employee_number}/{YYYY-MM-DD}_{Entrada|Salida}.jpg
 */
import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const PHOTOS_BASE = path.join(process.cwd(), 'data', 'employee-photos');
const db = new Database('multi_plant.db');

// Process in batches to avoid memory issues
const BATCH_SIZE = 200;
let offset = 0;
let totalExtracted = 0;
let totalStripped = 0;

const updateStmt = db.prepare(
  `UPDATE plant_entries SET raw_data = ? WHERE id = ?`,
);

console.log('Starting photo extraction from raw_data...');
console.log(`Output: ${PHOTOS_BASE}\n`);

while (true) {
  const rows = db
    .prepare(
      `
    SELECT id, employee_number, timestamp, action, raw_data
    FROM plant_entries
    WHERE raw_data LIKE '%photo%'
    ORDER BY id
    LIMIT ? OFFSET ?
  `,
    )
    .all(BATCH_SIZE, offset);

  if (rows.length === 0) break;

  const stripBatch = db.transaction((items) => {
    for (const row of items) {
      try {
        const raw = JSON.parse(row.raw_data);
        if (!raw.photo) continue;

        // Extract date from timestamp: "2026-02-10T06:08:42.887" → "2026-02-10"
        const dateStr = row.timestamp.split('T')[0];
        const action = (row.action || 'Entrada').replace(/\s+/g, '_');

        // Create directory: data/employee-photos/{employee_number}/
        const empDir = path.join(PHOTOS_BASE, row.employee_number);
        mkdirSync(empDir, { recursive: true });

        // Decode base64
        let base64Data = raw.photo;
        if (base64Data.startsWith('data:')) {
          base64Data = base64Data.split(',')[1];
        }
        const buffer = Buffer.from(base64Data, 'base64');

        // Save: {date}_{action}.jpg
        const fileName = `${dateStr}_${action}.jpg`;
        const filePath = path.join(empDir, fileName);
        writeFileSync(filePath, buffer);
        totalExtracted++;

        // Strip photo from raw_data
        delete raw.photo;
        const newRaw = JSON.stringify(raw);
        updateStmt.run(newRaw, row.id);
        totalStripped++;
      } catch (e) {
        console.error(`  Error processing entry ${row.id}: ${e.message}`);
      }
    }
  });

  stripBatch(rows);
  offset += BATCH_SIZE;

  if (offset % 1000 === 0) {
    console.log(`  Processed ${offset} entries...`);
  }
}

console.log(`\nDone!`);
console.log(`  Photos extracted: ${totalExtracted}`);
console.log(`  Raw data stripped: ${totalStripped}`);

// Vacuum the database to reclaim space
console.log('\nVacuuming database to reclaim space...');
db.exec('VACUUM');
const { statSync } = await import('fs');
const newSize = statSync('multi_plant.db').size;
console.log(`  New DB size: ${(newSize / 1024 / 1024).toFixed(1)} MB`);

db.close();
