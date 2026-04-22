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

  const rows = await prisma.$queryRaw<DailyActivityRow[]>(Prisma.sql`
    SELECT
      to_char((ended_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS activity_date,
      COUNT(*)::bigint AS count
    FROM typing_results
    WHERE user_id = ${userId}
      AND ended_at IS NOT NULL
      AND ended_at >= ${queryStart}
      AND ended_at < ${queryEndExclusive}
    GROUP BY (ended_at AT TIME ZONE 'UTC')::date
    ORDER BY activity_date ASC
  `);

  return rows.map((row) => ({
    date: dateFromKey(row.activity_date),
    count: Number(row.count),
  }));
}

function startOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
