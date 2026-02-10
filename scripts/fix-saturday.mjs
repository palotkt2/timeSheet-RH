#!/usr/bin/env node
/**
 * Fix Saturday (day 6) incorrectly included in "L - V" and "Choferes" shifts.
 * Only "Turno Guardias" and "FIN DE SEMANA" should include Saturday/Sunday.
 */
import Database from 'better-sqlite3';

const db = new Database('./multi_plant.db');

// Show current problem data
console.log('=== SHIFTS with Saturday that should NOT have it ===');
const badShifts = db
  .prepare(
    `SELECT id, source_plant_id, name, days FROM shifts 
   WHERE days LIKE '%6%' 
   AND name NOT LIKE '%Guardias%' 
   AND name NOT LIKE '%FIN DE SEMANA%'`,
  )
  .all();
console.table(badShifts);

console.log(
  '\n=== SHIFT ASSIGNMENTS with Saturday that should NOT have it ===',
);
const badAssignments = db
  .prepare(
    `SELECT COUNT(*) as cnt, shift_name, days FROM shift_assignments 
   WHERE days LIKE '%6%' 
   AND shift_name NOT LIKE '%Guardias%' 
   AND shift_name NOT LIKE '%FIN DE SEMANA%' 
   GROUP BY shift_name, days`,
  )
  .all();
console.table(badAssignments);

// FIX shifts table
const shiftsToFix = db
  .prepare(
    `SELECT id, days FROM shifts 
   WHERE days LIKE '%6%' 
   AND name NOT LIKE '%Guardias%' 
   AND name NOT LIKE '%FIN DE SEMANA%'`,
  )
  .all();
const updateShift = db.prepare('UPDATE shifts SET days = ? WHERE id = ?');
let shiftFixed = 0;
for (const s of shiftsToFix) {
  try {
    const arr = JSON.parse(s.days).filter((d) => d !== 6);
    updateShift.run(JSON.stringify(arr), s.id);
    shiftFixed++;
  } catch (e) {
    console.error('Error fixing shift', s.id, e.message);
  }
}
console.log('\nFixed', shiftFixed, 'shifts');

// FIX shift_assignments table
const assignmentsToFix = db
  .prepare(
    `SELECT id, days FROM shift_assignments 
   WHERE days LIKE '%6%' 
   AND shift_name NOT LIKE '%Guardias%' 
   AND shift_name NOT LIKE '%FIN DE SEMANA%'`,
  )
  .all();
const updateAssignment = db.prepare(
  'UPDATE shift_assignments SET days = ? WHERE id = ?',
);
let assignFixed = 0;
for (const a of assignmentsToFix) {
  try {
    const arr = JSON.parse(a.days).filter((d) => d !== 6);
    updateAssignment.run(JSON.stringify(arr), a.id);
    assignFixed++;
  } catch (e) {
    console.error('Error fixing assignment', a.id, e.message);
  }
}
console.log('Fixed', assignFixed, 'shift assignments');

// Verify
console.log('\n=== VERIFICATION ===');
const remaining = db
  .prepare(
    `SELECT COUNT(*) as cnt FROM shift_assignments 
   WHERE days LIKE '%6%' 
   AND shift_name NOT LIKE '%Guardias%' 
   AND shift_name NOT LIKE '%FIN DE SEMANA%'`,
  )
  .get();
console.log('Remaining bad assignments:', remaining.cnt);

const allDays = db
  .prepare(
    'SELECT DISTINCT days, shift_name FROM shift_assignments ORDER BY shift_name',
  )
  .all();
console.table(allDays);

db.close();
console.log('\nDone!');
