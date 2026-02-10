import Database from 'better-sqlite3';
const db = new Database('multi_plant.db');
const rows = db
  .prepare(
    "SELECT id, raw_data FROM plant_entries WHERE raw_data LIKE '%photo%' LIMIT 3",
  )
  .all();
for (const row of rows) {
  const p = JSON.parse(row.raw_data);
  const photoVal = p.photo;
  console.log(
    `id: ${row.id}, photo type: ${typeof photoVal}, photo: ${photoVal === null ? 'NULL' : photoVal ? String(photoVal).substring(0, 50) : 'falsy'}`,
  );
}
console.log(
  `\nRemaining with 'photo' in raw_data: ${db.prepare("SELECT COUNT(*) as c FROM plant_entries WHERE raw_data LIKE '%photo%'").get().c}`,
);
console.log(
  `Remaining with base64 photo: ${db.prepare("SELECT COUNT(*) as c FROM plant_entries WHERE raw_data LIKE '%base64%'").get().c}`,
);
db.close();
