import Database from 'better-sqlite3';
const db = new Database('multi_plant.db');

const assignments = db
  .prepare(
    `SELECT sa.employee_number, sa.shift_name, sa.start_time, sa.source_plant_id 
   FROM shift_assignments sa WHERE sa.active = 1 ORDER BY sa.id DESC`,
  )
  .all();

const byEmp = new Map();
for (const a of assignments) {
  if (!byEmp.has(a.employee_number)) byEmp.set(a.employee_number, []);
  byEmp.get(a.employee_number).push(a);
}

const testEmps = [
  '0304',
  '0812',
  '0781',
  '1237',
  '1442',
  '1418',
  '0005',
  '0265',
  '0534',
];
for (const emp of testEmps) {
  const list = byEmp.get(emp);
  if (!list) {
    console.log(emp + ': NO ASSIGNMENTS');
    continue;
  }

  let chosen = list[0];
  if (list.length > 1) {
    const specific = list.find((a) => {
      const name = a.shift_name.toLowerCase();
      return (
        a.start_time !== '06:00' ||
        name.includes('oficina') ||
        name.includes('chofer')
      );
    });
    if (specific) chosen = specific;
  }

  const allShifts = list
    .map((a) => `${a.shift_name}@${a.start_time}(P${a.source_plant_id})`)
    .join(', ');
  console.log(
    `${emp}: CHOSEN=${chosen.shift_name} ${chosen.start_time} | ALL=[${allShifts}]`,
  );
}

// Count how many have multiple
let multi = 0;
for (const [emp, list] of byEmp) {
  if (list.length > 1) multi++;
}
console.log(
  `\nTotal employees: ${byEmp.size}, with multiple assignments: ${multi}`,
);

db.close();
