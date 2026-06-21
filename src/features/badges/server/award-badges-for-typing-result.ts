"use server";

import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { evaluateEligibleBadges } from "../lib/badge-evaluator";

export type AwardBadgesInput = {
  // Values passed after the typing result and XP update are complete.
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
  // Server action: Clerk auth identifies whose badges should be checked.
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  try {
    // Transaction keeps all badge reads and writes consistent.
    const result = await prisma.$transaction(async (tx) => {
      // Count total completed tests for practice badges.
      const totalTestsAfter = await tx.typingResults.count({
        where: { user_id: userId },
      });
      // Prisma aggregate calculates average accuracy in the database.
      const averageAccuracyResult = await tx.typingResults.aggregate({
        where: { user_id: userId },
        _avg: { accuracy: true },
      });
      const averageAccuracy = averageAccuracyResult._avg.accuracy ?? 0;

      let firstCompletedGameRank: number | null = null;
      if (totalTestsAfter === 1) {
        // Raw SQL counts how many distinct users have completed at least one
        // typing result. This gives the user's first-completed-game rank for
        // special early-player badges.
        const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(DISTINCT user_id)::bigint AS count
          FROM typing_results
        `;
        const count = rows[0]?.count ?? BigInt(0);
        firstCompletedGameRank = Number(count);
      }

      // Load already-owned badge keys so the same badge is not awarded again.
      const existingBadges = await tx.userBadge.findMany({
        where: { user_id: userId },
        select: { badge_key: true },
      });
      // Set gives fast duplicate checks by badge key.
      const existingKeys = new Set(existingBadges.map((b) => b.badge_key));

      // Evaluate every badge rule using the latest result, average accuracy,
      // streak, level and total test count.
      const candidates = evaluateEligibleBadges({
        thisGame: { wpm: input.wpm, accuracy: input.accuracy },
        averageAccuracy,
        currentStreakDays: input.currentStreakDays,
        level: input.level,
        totalTestsAfter,
        firstCompletedGameRank,
      });

      // Keep only badges the user does not already have.
      const newBadges = candidates.filter((c) => !existingKeys.has(c.key));

      if (newBadges.length > 0) {
        // createMany inserts all new badges in one query. skipDuplicates is an
        // extra guard against race conditions or repeated requests.
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
