import Database from 'better-sqlite3';

const db = new Database('barcode_entries.db');
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all();
console.log(
  'Tables:',
  tables.map((t) => t.name),
);

const empShifts = db
  .prepare("SELECT * FROM employee_shifts WHERE employee_number = '0182'")
  .all();
console.log('employee_shifts:', JSON.stringify(empShifts, null, 2));

const mpDb = new Database('multi_plant.db');
const mpTables = mpDb
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all();
console.log(
  'MP Tables:',
  mpTables.map((t) => t.name),
);

// Check if there are any entries for 0182 in multi_plant
const mpEntries = mpDb
  .prepare(
    "SELECT date(timestamp) as d, timestamp, action FROM plant_entries WHERE employee_number = '0182' ORDER BY timestamp",
  )
  .all();
console.log('MP entries for 0182:', mpEntries.length, 'records');
if (mpEntries.length > 0) {
  console.log('First 10:', JSON.stringify(mpEntries.slice(0, 10), null, 2));
  console.log('Last 10:', JSON.stringify(mpEntries.slice(-10), null, 2));
}

// Check weekly — simulate what the report does for this week
const startDate = '2026-02-09';
const endDate = '2026-02-13';
const qStart = new Date(startDate + 'T00:00:00');
qStart.setDate(qStart.getDate() - 1);
const qEnd = new Date(endDate + 'T00:00:00');
qEnd.setDate(qEnd.getDate() + 1);
const fmt = (d) => d.toISOString().split('T')[0];

const records = mpDb
  .prepare(
    `
  SELECT pe.employee_number, date(pe.timestamp) as workDate, pe.timestamp, pe.action, p.name as plant_name
  FROM plant_entries pe INNER JOIN plants p ON pe.plant_id = p.id
  WHERE date(pe.timestamp) BETWEEN ? AND ? AND pe.employee_number = '0182'
  ORDER BY pe.timestamp
`,
  )
  .all(fmt(qStart), fmt(qEnd));
console.log(
  `\nRecords in range ${fmt(qStart)} to ${fmt(qEnd)}:`,
  records.length,
);
for (const r of records) {
  console.log(`  ${r.workDate} ${r.timestamp} ${r.action} (${r.plant_name})`);
}

db.close();
mpDb.close();
