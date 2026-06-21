import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type DailyActivity = {
  date: Date;
  count: number;
};

type DailyActivityRow = {
  activity_date: string;
  count: bigint;
};

export async function getDailyActivity(userId: string): Promise<DailyActivity[]> {
  // Build the date range used by the heatmap. The query covers the last twelve
  // months and the 2026 range used by the UI dropdown.
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const lastTwelveMonthsStart = new Date(today);
  lastTwelveMonthsStart.setMonth(lastTwelveMonthsStart.getMonth() - 12);

  const yearStart = new Date(2026, 0, 1);
  const yearEndExclusive = new Date(2027, 0, 1);
  const queryStart =
    lastTwelveMonthsStart < yearStart ? lastTwelveMonthsStart : yearStart;
  const queryEndExclusive =
    tomorrow > yearEndExclusive ? tomorrow : yearEndExclusive;

  // Raw SQL is used here because grouping by the UTC date part of a timestamp is
  // easier and clearer in SQL than with Prisma's normal query builder.
  const rows = await prisma.$queryRaw<DailyActivityRow[]>(Prisma.sql`
    SELECT
      -- Convert ended_at to a UTC calendar date string like 2026-04-19.
      to_char((ended_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS activity_date,
      -- Count how many completed typing results happened on that date.
      COUNT(*)::bigint AS count
    FROM typing_results
    WHERE user_id = ${userId}
      AND ended_at IS NOT NULL
      AND ended_at >= ${queryStart}
      AND ended_at < ${queryEndExclusive}
    GROUP BY (ended_at AT TIME ZONE 'UTC')::date
    ORDER BY activity_date ASC
  `);

  // Convert SQL rows into the Date/count shape used by the heatmap component.
  return rows.map((row) => ({
    date: dateFromKey(row.activity_date),
    count: Number(row.count),
  }));
}

function startOfDay(date: Date) {
  // Normalise a Date to local midnight so range calculations start cleanly.
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function dateFromKey(key: string) {
  // Convert YYYY-MM-DD into a JavaScript Date for the heatmap cells.
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
