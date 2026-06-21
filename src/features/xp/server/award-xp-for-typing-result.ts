"use server";

import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { computeXp, type IncompleteRun, type XpBreakdown } from "../lib/compute-xp";
import { levelForTotalXp } from "../lib/level";
import { diffInDaysUtc, startOfIsoWeekMonday, startOfUtcDay } from "../lib/date-utils";

export type AwardXpInput = {
  // Data passed from the completed typing game into the XP server action.
  typingResultId: number;
  elapsedSeconds: number;
  accuracy: number;
  mode: "time" | "words" | "quote";
  punctuation: boolean;
  numbers: boolean;
  cleanRun: boolean;
  incompleteRuns: IncompleteRun[];
};

export type AwardXpSuccess = {
  // Successful response returned to the typing game and XP UI.
  ok: true;
  breakdown: XpBreakdown;
  totalXpBefore: number;
  totalXpAfter: number;
  levelBefore: number;
  levelAfter: number;
  streakBefore: number;
  streakAfter: number;
  dailyBonusAwarded: boolean;
};

export type AwardXpResult = AwardXpSuccess | { ok: false; error: string };

export async function awardXpForTypingResult(input: AwardXpInput): Promise<AwardXpResult> {
  // Clerk auth runs on the server and identifies the signed-in user.
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  try {
    // Prisma transaction keeps XP, streak and weekly XP updates consistent. If
    // one database write fails, the whole group is rolled back.
    const result = await prisma.$transaction(async (tx) => {
      // Today and weekStart use UTC so daily streaks and weekly XP are stable
      // across different user timezones.
      const today = startOfUtcDay();
      const weekStart = startOfIsoWeekMonday(today);

      // Load the existing XP row. New users may not have one yet.
      const existing = await tx.userXp.findUnique({
        where: { user_id: userId },
      });

      const totalXpBefore = existing?.total_xp ?? 0;
      const levelBefore = existing?.current_level ?? 0;
      const streakBefore = existing?.current_streak_days ?? 0;

      const lastStreakDate = existing?.last_streak_date ?? null;
      let streakAfter: number;
      if (!lastStreakDate) {
        // First recorded streak day.
        streakAfter = 1;
      } else {
        const daysSince = diffInDaysUtc(today, lastStreakDate);
        if (daysSince === 0) {
          // Same UTC day: keep the current streak, do not add another day.
          streakAfter = streakBefore > 0 ? streakBefore : 1;
        } else if (daysSince === 1) {
          // Next UTC day: continue the streak.
          streakAfter = streakBefore + 1;
        } else {
          // Missed at least one day: reset the streak to 1.
          streakAfter = 1;
        }
      }

      const lastDailyBonusDate = existing?.last_daily_bonus_date ?? null;
      // Daily bonus is awarded once per UTC day.
      const isFirstCompletedToday =
        !lastDailyBonusDate || diffInDaysUtc(today, lastDailyBonusDate) >= 1;

      // Pure calculation step: no database writes happen inside computeXp().
      const breakdown = computeXp({
        elapsedSeconds: input.elapsedSeconds,
        accuracy: input.accuracy,
        mode: input.mode,
        punctuation: input.punctuation,
        numbers: input.numbers,
        cleanRun: input.cleanRun,
        streakDaysAfter: streakAfter,
        incompleteRuns: input.incompleteRuns,
        currentTotalXp: totalXpBefore,
        isFirstCompletedToday,
      });

      const totalXpAfter = totalXpBefore + breakdown.total;
      const levelAfter = levelForTotalXp(totalXpAfter);
      // max_streak_days stores the user's best ever streak, not just the current
      // streak.
      const maxStreakAfter = Math.max(existing?.max_streak_days ?? 0, streakAfter);
      // Detect whether computeXp included a daily bonus contribution.
      const dailyBonusAwarded = breakdown.contributions.some((c) => c.id === "daily");

      // upsert means "update if row exists, otherwise create it". This handles
      // both new users and returning users with one Prisma call.
      await tx.userXp.upsert({
        where: { user_id: userId },
        create: {
          user_id: userId,
          total_xp: totalXpAfter,
          current_level: levelAfter,
          current_streak_days: streakAfter,
          max_streak_days: maxStreakAfter,
          last_streak_date: today,
          last_daily_bonus_date: dailyBonusAwarded ? today : null,
        },
        update: {
          total_xp: totalXpAfter,
          current_level: levelAfter,
          current_streak_days: streakAfter,
          max_streak_days: maxStreakAfter,
          last_streak_date: today,
          last_daily_bonus_date: dailyBonusAwarded
            ? today
            : (existing?.last_daily_bonus_date ?? null),
        },
      });

      // Weekly XP is stored separately for weekly progress/leaderboard style
      // data. It is grouped by user_id and week_start.
      await tx.weeklyXp.upsert({
        where: {
          user_id_week_start: { user_id: userId, week_start: weekStart },
        },
        create: {
          user_id: userId,
          week_start: weekStart,
          xp: breakdown.total,
          time_typed_seconds: Math.max(0, input.elapsedSeconds),
        },
        update: {
          // Prisma increment adds to the existing values atomically.
          xp: { increment: breakdown.total },
          time_typed_seconds: { increment: Math.max(0, input.elapsedSeconds) },
        },
      });

      return {
        // Return before/after values so the UI can show exactly what changed.
        ok: true as const,
        breakdown,
        totalXpBefore,
        totalXpAfter,
        levelBefore,
        levelAfter,
        streakBefore,
        streakAfter,
        dailyBonusAwarded,
      };
    });
    return result;
  } catch (err) {
    console.error("awardXpForTypingResult error:", err);
    return { ok: false, error: String(err) };
  }
}
