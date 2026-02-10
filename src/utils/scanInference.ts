/**
 * Shared scan inference logic for entry/exit determination.
 *
 * All views (Live, Daily, Weekly, Validation) MUST use this module
 * to ensure consistent results across the application.
 *
 * Strategy:
 *   1. Sort all scans chronologically.
 *   2. Deduplicate scans within DEDUP_GAP_MS of each other.
 *   3. Assign alternating Entry / Exit based on position (even=Entry, odd=Exit).
 *   4. If only 1 scan remains → Entry only (employee is "active" / "Sin salida").
 */

/** Minimum gap between scans to count as distinct events (5 min). */
export const DEDUP_GAP_MS = 5 * 60 * 1000;

export interface InferredScans {
  /** Deduplicated & sorted timestamps kept after dedup */
  deduped: Date[];
  /** Entry timestamps (even-indexed in deduped) */
  entries: Date[];
  /** Exit timestamps (odd-indexed in deduped) */
  exits: Date[];
}

/**
 * Given a list of raw scan timestamps for a single employee on a single day,
 * deduplicate and infer entries/exits via alternating assignment.
 *
 * @param rawScans - Array of Date objects (order doesn't matter, will be sorted).
 * @returns InferredScans with entries and exits arrays.
 */
export function inferEntryExit(rawScans: Date[]): InferredScans {
  if (rawScans.length === 0) {
    return { deduped: [], entries: [], exits: [] };
  }

  // Sort chronologically
  const sorted = [...rawScans].sort((a, b) => a.getTime() - b.getTime());

  // Deduplicate: skip scans within DEDUP_GAP_MS of the previous kept scan
  const deduped: Date[] = [];
  for (const scan of sorted) {
    if (
      deduped.length === 0 ||
      scan.getTime() - deduped[deduped.length - 1].getTime() >= DEDUP_GAP_MS
    ) {
      deduped.push(scan);
    }
  }

  // Assign alternating Entry / Exit
  const entries: Date[] = [];
  const exits: Date[] = [];
  for (let i = 0; i < deduped.length; i++) {
    if (i % 2 === 0) entries.push(deduped[i]);
    else exits.push(deduped[i]);
  }

  return { deduped, entries, exits };
}

/**
 * Determine if an employee is currently "active" (still working)
 * based on their inferred scans for today.
 *
 * Active = has entry but no matching exit (odd number of deduped scans).
 */
export function isEmployeeActive(inferred: InferredScans): boolean {
  return inferred.entries.length > inferred.exits.length;
}

/**
 * Calculate total worked hours from paired entry/exit sessions.
 * Uses the same greedy matching as the weekly report.
 */
export interface WorkSession {
  entry: Date;
  exit: Date;
  hours: number;
}

export function calculateSessions(
  entries: Date[],
  exits: Date[],
): { sessions: WorkSession[]; totalHours: number } {
  const sessions: WorkSession[] = [];
  let totalHours = 0;
  let exitIndex = 0;

  const sortedEntries = [...entries].sort((a, b) => a.getTime() - b.getTime());
  const sortedExits = [...exits].sort((a, b) => a.getTime() - b.getTime());

  for (const entryTime of sortedEntries) {
    while (
      exitIndex < sortedExits.length &&
      sortedExits[exitIndex] <= entryTime
    )
      exitIndex++;
    if (exitIndex < sortedExits.length) {
      const exitTime = sortedExits[exitIndex];
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

  return { sessions, totalHours: Math.round(totalHours * 100) / 100 };
}

// ── Night-shift helpers ──

/**
 * Build a map of employee → night-shift boundary hour.
 * Night shift = shift start hour > shift end hour (crosses midnight).
 * Boundary = midpoint of off-shift period; early-morning scans (hour < boundary)
 * are remapped to the previous calendar day.
 */
export function buildNightShiftBoundary<
  T extends { start_time: string; end_time: string },
>(shifts: Map<string, T>): Map<string, number> {
  const boundary = new Map<string, number>();
  for (const [empNum, shift] of shifts) {
    const sh = parseInt(shift.start_time.split(':')[0]);
    const eh = parseInt(shift.end_time.split(':')[0]);
    if (sh > eh) {
      boundary.set(empNum, Math.floor((sh + eh) / 2));
    }
  }
  return boundary;
}

/**
 * Remap the logical work-date of a scan for night-shift employees.
 * Early-morning scans (before boundary hour) are assigned to the previous day.
 *
 * @param workDate   - calendar date of the scan (YYYY-MM-DD)
 * @param timestamp  - full ISO timestamp of the scan
 * @param boundary   - night-shift boundary map from buildNightShiftBoundary
 * @param empNum     - employee number
 * @returns logical work-date string (YYYY-MM-DD)
 */
export function remapNightShiftDate(
  workDate: string,
  timestamp: string,
  boundary: Map<string, number>,
  empNum: string,
): string {
  const bh = boundary.get(empNum);
  if (bh !== undefined) {
    const scanHour = new Date(timestamp).getHours();
    if (scanHour < bh) {
      const d = new Date(workDate + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    }
  }
  return workDate;
}
