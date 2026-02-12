import Database from 'better-sqlite3';
const db = new Database('multi_plant.db');

// Check how shift resolution works — does an employee have multiple shift_assignments?
const dupes = db
  .prepare(
    `
  SELECT employee_number, COUNT(*) as cnt 
  FROM shift_assignments WHERE active = 1 
  GROUP BY employee_number HAVING cnt > 1
`,
  )
  .all();
console.log('Employees with multiple shift assignments:', dupes.length);
if (dupes.length > 0) console.log('Sample:', dupes.slice(0, 5));

// Check employee 0812 — all shift assignments
const all0812 = db
  .prepare('SELECT * FROM shift_assignments WHERE employee_number = ?')
  .all('0812');
console.log(
  '\nAll shift_assignments for 0812:',
  JSON.stringify(all0812, null, 2),
);

// The real issue: same shift_id across plants means different shifts
// Check what shifts exist with same remote_shift_id
const shifts = db
  .prepare('SELECT * FROM shifts ORDER BY source_plant_id, remote_shift_id')
  .all();
console.log('\nAll shifts:');
for (const s of shifts) {
  console.log(
    `  Plant ${s.source_plant_id} | remote_id=${s.remote_shift_id} | ${s.name} | ${s.start_time}-${s.end_time} | tol=${s.tolerance_minutes} | custom=${s.custom_hours}`,
  );
}

// The weekly report picks the LAST assignment due to Map.set override
// Let's see what order they come in for 0812
const mpSA = db
  .prepare(
    `
  SELECT sa.employee_number, sa.shift_id, sa.shift_name, sa.start_time, sa.end_time, sa.days,
         sa.source_plant_id, s.tolerance_minutes, s.custom_hours
  FROM shift_assignments sa
  LEFT JOIN shifts s ON sa.shift_id = s.remote_shift_id AND sa.source_plant_id = s.source_plant_id
  WHERE sa.active = 1 AND sa.employee_number = '0812'
`,
  )
  .all();
console.log('\nMP shift assignments for 0812 (as loaded by weekly report):');
console.log(JSON.stringify(mpSA, null, 2));

db.close();
