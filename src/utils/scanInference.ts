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

/** Minimum gap between scans to count as distinct events (15 min). */
export const DEDUP_GAP_MS = 15 * 60 * 1000;

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
