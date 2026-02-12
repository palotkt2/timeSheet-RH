import Database from 'better-sqlite3';
const db = new Database('multi_plant.db');

// Employees in Planta 2 - Oficinas (plant_id=4)
const oficina = db
  .prepare(
    'SELECT DISTINCT pe.employee_number FROM plant_entries pe WHERE pe.plant_id = 4',
  )
  .all()
  .map((r) => r.employee_number);
console.log('Employees checking into Planta 2 Oficinas:', oficina.length);

for (const emp of oficina) {
  const sa = db
    .prepare(
      'SELECT shift_name, start_time, source_plant_id FROM shift_assignments WHERE employee_number = ? AND active = 1',
    )
    .all(emp);
  const names = sa
    .map((s) => `${s.shift_name} ${s.start_time} (P${s.source_plant_id})`)
    .join(', ');
  console.log(`  ${emp}: ${names || 'NO SHIFT'}`);
}

db.close();
