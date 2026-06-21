export function startOfUtcDay(date: Date = new Date()): Date {
  // Normalise a Date to midnight UTC. This makes daily streak and daily bonus
  // checks use one global day boundary rather than local browser time.
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function diffInDaysUtc(a: Date, b: Date): number {
  // Compare two dates by UTC calendar day. The result is used to decide whether
  // a streak continued, stayed on the same day, or reset.
  const msPerDay = 24 * 60 * 60 * 1000;
  const da = startOfUtcDay(a).getTime();
  const db = startOfUtcDay(b).getTime();
  return Math.round((da - db) / msPerDay);
}

export function startOfIsoWeekMonday(date: Date = new Date()): Date {
  // Weekly XP is grouped by ISO-style weeks, where Monday is the first day.
  const d = startOfUtcDay(date);
  const dayOfWeek = d.getUTCDay();
  const offset = (dayOfWeek + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}
