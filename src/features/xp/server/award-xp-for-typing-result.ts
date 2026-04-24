"use server";

import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { computeXp, type IncompleteRun, type XpBreakdown } from "../lib/compute-xp";
import { levelForTotalXp } from "../lib/level";
import { diffInDaysUtc, startOfIsoWeekMonday, startOfUtcDay } from "../lib/date-utils";

export type AwardXpInput = {
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
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const today = startOfUtcDay();
      const weekStart = startOfIsoWeekMonday(today);

      const existing = await tx.userXp.findUnique({
        where: { user_id: userId },
      });

      const totalXpBefore = existing?.total_xp ?? 0;
      const levelBefore = existing?.current_level ?? 0;
      const streakBefore = existing?.current_streak_days ?? 0;

      const lastStreakDate = existing?.last_streak_date ?? null;
      let streakAfter: number;
      if (!lastStreakDate) {
        streakAfter = 1;
      } else {
        const daysSince = diffInDaysUtc(today, lastStreakDate);
        if (daysSince === 0) {
          streakAfter = streakBefore > 0 ? streakBefore : 1;
        } else if (daysSince === 1) {
          streakAfter = streakBefore + 1;
        } else {
          streakAfter = 1;
        }
      }

      const lastDailyBonusDate = existing?.last_daily_bonus_date ?? null;
      const isFirstCompletedToday =
        !lastDailyBonusDate || diffInDaysUtc(today, lastDailyBonusDate) >= 1;

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
      const maxStreakAfter = Math.max(existing?.max_streak_days ?? 0, streakAfter);
      const dailyBonusAwarded = breakdown.contributions.some((c) => c.id === "daily");

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
          xp: { increment: breakdown.total },
          time_typed_seconds: { increment: Math.max(0, input.elapsedSeconds) },
        },
      });

      return {
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
