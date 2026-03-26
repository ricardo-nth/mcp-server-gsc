/** Format a Date as YYYY-MM-DD */
export function formatDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateString(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Get a date N days ago from today (or from a reference date) */
export function daysAgo(n: number, from?: Date): Date {
  const base = from ? new Date(from) : new Date();
  const d = new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate(),
    ),
  );
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

/**
 * Compute a relative date range ending yesterday (GSC data lag).
 * `days: 7` means 7 calendar days inclusive (e.g. Jan 8–Jan 14).
 * Returns { startDate, endDate } as YYYY-MM-DD strings.
 */
export function relativeDateRange(days: number): {
  startDate: string;
  endDate: string;
} {
  const end = daysAgo(1); // yesterday — GSC data lag
  const start = daysAgo(days - 1, end); // -1 because both endpoints are inclusive
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

/**
 * Resolve a flexible date range: if `days` is given, compute relative range.
 * If startDate/endDate are given, use them. Throws if neither is provided.
 */
export function resolveDateRange(args: {
  startDate?: string;
  endDate?: string;
  days?: number;
}): { startDate: string; endDate: string } {
  if (args.days) return relativeDateRange(args.days);
  if (args.startDate && args.endDate) {
    return { startDate: args.startDate, endDate: args.endDate };
  }
  throw new Error(
    'Either "days" or both "startDate" and "endDate" must be provided.',
  );
}

export function inclusiveDayCount(startDate: string, endDate: string): number {
  const start = parseDateString(startDate);
  const end = parseDateString(endDate);
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Split an explicit caller-provided range into two equal comparison windows.
 * If the total range is odd-length, the oldest extra day is dropped so both
 * periods remain equal and directly comparable.
 */
export function splitExplicitDateRange(startDate: string, endDate: string): {
  periodA: { startDate: string; endDate: string };
  periodB: { startDate: string; endDate: string };
} {
  const totalDays = inclusiveDayCount(startDate, endDate);
  const periodDays = Math.max(1, Math.floor(totalDays / 2));
  const recentEnd = parseDateString(endDate);
  const recentStart = addUtcDays(recentEnd, -(periodDays - 1));
  const priorEnd = addUtcDays(recentStart, -1);
  const priorStart = addUtcDays(priorEnd, -(periodDays - 1));

  return {
    periodA: { startDate: formatDate(recentStart), endDate: formatDate(recentEnd) },
    periodB: { startDate: formatDate(priorStart), endDate: formatDate(priorEnd) },
  };
}

/**
 * Compute two equal-length periods for comparison.
 * Period A (recent): ends yesterday, spans `days`.
 * Period B (previous): ends the day before period A starts, spans `days`.
 */
export function comparePeriods(days: number): {
  periodA: { startDate: string; endDate: string };
  periodB: { startDate: string; endDate: string };
} {
  const endA = daysAgo(1);
  const startA = daysAgo(days - 1, endA);
  const endB = daysAgo(1, startA);
  const startB = daysAgo(days - 1, endB);
  return {
    periodA: { startDate: formatDate(startA), endDate: formatDate(endA) },
    periodB: { startDate: formatDate(startB), endDate: formatDate(endB) },
  };
}

/**
 * Compute a rolling window: a series of sub-periods of `windowDays` length
 * within the overall range. Used for trend detection (e.g. decay).
 */
export function rollingWindows(
  totalDays: number,
  windowDays: number,
  stepDays?: number,
): Array<{ startDate: string; endDate: string }> {
  const step = stepDays ?? windowDays;
  const windows: Array<{ startDate: string; endDate: string }> = [];
  const today = daysAgo(1); // end reference

  for (let offset = 0; offset + windowDays <= totalDays; offset += step) {
    const endDate = daysAgo(offset, today);
    const startDate = daysAgo(windowDays - 1, endDate);
    windows.push({
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
    });
  }

  // Reverse so oldest window is first (chronological order)
  return windows.reverse();
}
