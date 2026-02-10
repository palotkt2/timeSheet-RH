// Check current raw_data storage and photo presence
import Database from 'better-sqlite3';

const db = new Database('multi_plant.db');

// Check raw_data sizes
const stats = db
  .prepare(
    `
  SELECT 
    COUNT(*) as total_entries,
    SUM(CASE WHEN raw_data IS NOT NULL THEN length(raw_data) ELSE 0 END) as total_raw_bytes,
    AVG(CASE WHEN raw_data IS NOT NULL THEN length(raw_data) ELSE 0 END) as avg_raw_bytes,
    SUM(CASE WHEN raw_data LIKE '%photo%' THEN 1 ELSE 0 END) as entries_with_photo
  FROM plant_entries
`,
  )
  .get();

console.log('Plant entries stats:');
console.log(`  Total entries: ${stats.total_entries}`);
console.log(
  `  Total raw_data size: ${(stats.total_raw_bytes / 1024 / 1024).toFixed(1)} MB`,
);
console.log(
  `  Avg raw_data size: ${(stats.avg_raw_bytes / 1024).toFixed(1)} KB`,
);
console.log(`  Entries with photo in raw_data: ${stats.entries_with_photo}`);

// Sample a raw_data to see if photo is there
const sample = db
  .prepare(
    "SELECT raw_data FROM plant_entries WHERE raw_data LIKE '%photo%' LIMIT 1",
  )
  .get();
if (sample) {
  const parsed = JSON.parse(sample.raw_data);
  const keys = Object.keys(parsed);
  console.log('\nSample raw_data keys:', keys.join(', '));
  if (parsed.photo) {
    console.log(`Photo field length: ${parsed.photo.length} chars`);
    console.log(`Photo prefix: ${parsed.photo.substring(0, 50)}...`);
  }
}

// DB file size
import { statSync } from 'fs';
const dbSize = statSync('multi_plant.db').size;
console.log(`\nDB file size: ${(dbSize / 1024 / 1024).toFixed(1)} MB`);

db.close();
