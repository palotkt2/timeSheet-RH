/**
 * Trace David (0403) overtime calculation exactly as the weekly route does it.
 * Match the UI output: A A E N A F F F F | 4 present | 3 faltas | 0 late | 9.58h OT
 */
import Database from 'better-sqlite3';

const mpDb = new Database('./multi_plant.db');
const DEDUP_GAP_MS = 15 * 60 * 1000;
const OT_MIN_HOURS = 5 / 60;

function inferEntryExit(rawScans) {
  const sorted = [...rawScans].sort((a, b) => a.getTime() - b.getTime());
  const deduped = [];
  for (const scan of sorted) {
    if (
      deduped.length === 0 ||
      scan.getTime() - deduped[deduped.length - 1].getTime() >= DEDUP_GAP_MS
    )
      deduped.push(scan);
  }
  const entries = [],
    exits = [];
  for (let i = 0; i < deduped.length; i++) {
    if (i % 2 === 0) entries.push(deduped[i]);
    else exits.push(deduped[i]);
  }
  return { entries, exits };
}

function calculateDailyHours(entries, exits) {
  let totalHours = 0;
  const sessions = [];
  let exitIndex = 0;
  const se = [...entries].sort((a, b) => a.getTime() - b.getTime());
  const sx = [...exits].sort((a, b) => a.getTime() - b.getTime());
  for (const entryTime of se) {
    while (exitIndex < sx.length && sx[exitIndex] <= entryTime) exitIndex++;
    if (exitIndex < sx.length) {
      const exitTime = sx[exitIndex];
      const hours =
        (exitTime.getTime() - entryTime.getTime()) / (1000 * 60 * 60);
      if (hours >= 0.1 && hours <= 24) {
        sessions.push({
          entry: entryTime,
          exit: exitTime,
          hours: Math.round(hours * 100) / 100,
        });
        totalHours += hours;
        exitIndex++;
      }
    }
  }
  return { totalHours: Math.round(totalHours * 100) / 100, sessions };
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtTime(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Try different date ranges to match the 9-column pattern
const ranges = [
  { start: '2026-02-02', end: '2026-02-10' }, // Mon Feb 2 - Tue Feb 10 (9 days)
  { start: '2026-02-02', end: '2026-02-08' }, // Mon Feb 2 - Sun Feb 8 (7 days)
  { start: '2026-01-26', end: '2026-02-08' }, // Mon Jan 26 - Sun Feb 8
];

const empNum = '0403';

// Get shift assignment
const shift = mpDb
  .prepare(
    'SELECT * FROM shift_assignments WHERE employee_number = ? AND active = 1',
  )
  .get(empNum);
console.log('Shift:', JSON.stringify(shift, null, 2));
let workDays;
try {
  workDays = JSON.parse(shift.days);
} catch {
  workDays = [1, 2, 3, 4, 5];
}

// Get ALL entries for this employee in Feb
const allEntries = mpDb
  .prepare(
    `
  SELECT pe.employee_number, date(pe.timestamp) as workDate, pe.timestamp, pe.action, p.name as plant_name
  FROM plant_entries pe INNER JOIN plants p ON pe.plant_id = p.id
  WHERE pe.employee_number = ? AND date(pe.timestamp) BETWEEN '2026-01-25' AND '2026-02-15'
  ORDER BY pe.timestamp ASC
`,
  )
  .all(empNum);

console.log('\n=== ALL SCANS ===');
for (const e of allEntries) {
  const d = new Date(e.timestamp);
  const dayName = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getDay()];
  console.log(
    `  ${e.workDate} (${dayName}) ${fmtTime(d)} [${e.action}] @ ${e.plant_name}`,
  );
}

for (const range of ranges) {
  console.log(
    `\n\n========== RANGE: ${range.start} to ${range.end} ==========`,
  );

  const qStart = new Date(range.start + 'T00:00:00');
  qStart.setDate(qStart.getDate() - 1);
  const qEnd = new Date(range.end + 'T00:00:00');
  qEnd.setDate(qEnd.getDate() + 1);

  const records = mpDb
    .prepare(
      `
    SELECT pe.employee_number, date(pe.timestamp) as workDate, pe.timestamp, p.name as plant_name
    FROM plant_entries pe INNER JOIN plants p ON pe.plant_id = p.id
    WHERE pe.employee_number = ? AND date(pe.timestamp) BETWEEN ? AND ?
    ORDER BY pe.timestamp ASC
  `,
    )
    .all(empNum, fmtDate(qStart), fmtDate(qEnd));

  // Group by date
  const dateMap = new Map();
  for (const r of records) {
    if (!dateMap.has(r.workDate)) dateMap.set(r.workDate, []);
    dateMap.get(r.workDate).push(new Date(r.timestamp));
  }

  // Generate days
  const allDays = [];
  const cur = new Date(range.start + 'T00:00:00');
  const endD = new Date(range.end + 'T00:00:00');
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  while (cur <= endD) {
    allDays.push({
      date: fmtDate(cur),
      dow: cur.getDay(),
      dayName: dayNames[cur.getDay()],
    });
    cur.setDate(cur.getDate() + 1);
  }

  let totalOT = 0;
  let totalHours = 0;
  let daysPresent = 0;
  let faltas = 0;
  const statusCodes = [];

  for (const day of allDays) {
    const scans = dateMap.get(day.date) || [];
    const isWorkday = workDays.includes(day.dow);

    if (scans.length === 0) {
      if (isWorkday) {
        faltas++;
        statusCodes.push('F');
      } else statusCodes.push('N');
      console.log(
        `  ${day.date} (${day.dayName}) ${isWorkday ? 'WD' : 'NW'}: No scans → ${isWorkday ? 'F' : 'N'}`,
      );
      continue;
    }

    daysPresent++;
    const { entries, exits } = inferEntryExit(scans);
    const { totalHours: dayHours, sessions } = calculateDailyHours(
      entries,
      exits,
    );
    totalHours += dayHours;

    // Overtime calculation — EXACT COPY from the route
    let dailyOT = 0;
    if (!isWorkday) {
      dailyOT = dayHours;
    } else if (sessions.length > 0) {
      const [seh, sem] = shift.end_time.split(':').map(Number);
      const shiftEnd = new Date(day.date + 'T00:00:00');
      shiftEnd.setHours(seh, sem, 0, 0);
      const ssh = parseInt(shift.start_time.split(':')[0]);
      if (ssh > seh) shiftEnd.setDate(shiftEnd.getDate() + 1);

      for (const s of sessions) {
        if (s.exit.getTime() > shiftEnd.getTime()) {
          const otStart =
            s.entry.getTime() > shiftEnd.getTime() ? s.entry : shiftEnd;
          dailyOT += (s.exit.getTime() - otStart.getTime()) / (1000 * 60 * 60);
        }
      }
      if (dailyOT < OT_MIN_HOURS) dailyOT = 0;
    }
    dailyOT = Math.round(dailyOT * 100) / 100;
    totalOT += dailyOT;

    const statusCode = !isWorkday ? (dayHours > 0 ? 'E' : 'N') : 'A';
    statusCodes.push(statusCode);

    const sessStr = sessions
      .map((s) => `${fmtTime(s.entry)}-${fmtTime(s.exit)} (${s.hours}h)`)
      .join(' + ');
    console.log(
      `  ${day.date} (${day.dayName}) ${isWorkday ? 'WD' : 'NW'}: ${dayHours}h [${sessStr}] OT=${dailyOT}h → ${statusCode}`,
    );
  }

  totalOT = Math.round(totalOT * 100) / 100;
  console.log(`\n  Status: ${statusCodes.join(' ')}`);
  console.log(`  Days present: ${daysPresent} | Faltas: ${faltas}`);
  console.log(
    `  Total OT: ${totalOT}h | Total Hours: ${Math.round(totalHours * 100) / 100}h`,
  );

  // Check if this matches user's reported output
  if (statusCodes.join(' ') === 'A A E N A F F F F') {
    console.log(`\n  *** THIS MATCHES USER'S PATTERN! ***`);
  }
}

mpDb.close();
