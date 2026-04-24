export function startOfUtcDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function diffInDaysUtc(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const da = startOfUtcDay(a).getTime();
  const db = startOfUtcDay(b).getTime();
  return Math.round((da - db) / msPerDay);
}

export function startOfIsoWeekMonday(date: Date = new Date()): Date {
  const d = startOfUtcDay(date);
  const dayOfWeek = d.getUTCDay();
  const offset = (dayOfWeek + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}
