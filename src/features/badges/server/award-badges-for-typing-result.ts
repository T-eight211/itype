"use server";

import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { evaluateEligibleBadges } from "../lib/badge-evaluator";

export type AwardBadgesInput = {
  typingResultId: number;
  wpm: number;
  accuracy: number;
  currentStreakDays: number;
  level: number;
};

export type AwardBadgesResult =
  | { ok: true; newBadgeKeys: string[] }
  | { ok: false; error: string };

export async function awardBadgesForTypingResult(
  input: AwardBadgesInput,
): Promise<AwardBadgesResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const totalTestsAfter = await tx.typingResults.count({
        where: { user_id: userId },
      });
      const averageAccuracyResult = await tx.typingResults.aggregate({
        where: { user_id: userId },
        _avg: { accuracy: true },
      });
      const averageAccuracy = averageAccuracyResult._avg.accuracy ?? 0;

      let firstCompletedGameRank: number | null = null;
      if (totalTestsAfter === 1) {
        const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(DISTINCT user_id)::bigint AS count
          FROM typing_results
        `;
        const count = rows[0]?.count ?? BigInt(0);
        firstCompletedGameRank = Number(count);
      }

      const existingBadges = await tx.userBadge.findMany({
        where: { user_id: userId },
        select: { badge_key: true },
      });
      const existingKeys = new Set(existingBadges.map((b) => b.badge_key));

      const candidates = evaluateEligibleBadges({
        thisGame: { wpm: input.wpm, accuracy: input.accuracy },
        averageAccuracy,
        currentStreakDays: input.currentStreakDays,
        level: input.level,
        totalTestsAfter,
        firstCompletedGameRank,
      });

      const newBadges = candidates.filter((c) => !existingKeys.has(c.key));

      if (newBadges.length > 0) {
        await tx.userBadge.createMany({
          data: newBadges.map((b) => ({
            user_id: userId,
            badge_key: b.key,
            source_result_id: input.typingResultId,
            metadata: b.metadata,
          })),
          skipDuplicates: true,
        });
      }

      return {
        ok: true as const,
        newBadgeKeys: newBadges.map((b) => b.key),
      };
    });
    return result;
  } catch (err) {
    console.error("awardBadgesForTypingResult error:", err);
    return { ok: false, error: String(err) };
  }
}
