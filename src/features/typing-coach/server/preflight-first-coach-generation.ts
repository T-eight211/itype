import "server-only";

import { prisma } from "@/lib/prisma";

import { getTypingCoachAIEligibilityForUser } from "./get-ai-aggregate";

const SESSIONS_BEFORE_RECOACH = 10;
const ERRORS_BEFORE_RECOACH = 20;

export async function preflightCoachGeneration(
  userId: string
): Promise<{ shouldRun: boolean }> {
  const pendingRun = await prisma.typingCoachAiRun.findFirst({
    where: { user_id: userId, status: "pending" },
    select: { id: true },
  });
  if (pendingRun) return { shouldRun: false };

  const eligibility = await getTypingCoachAIEligibilityForUser(userId, "last_30d");
  if (!eligibility.ready) return { shouldRun: false };

  const lastCompleted = await prisma.typingCoachAiRun.findFirst({
    where: { user_id: userId, status: "completed" },
    orderBy: { completed_at: "desc" },
    select: { completed_at: true },
  });

  if (!lastCompleted?.completed_at) {
    return { shouldRun: true };
  }

  const since = lastCompleted.completed_at;

  const newSessionCount = await prisma.typingResults.count({
    where: {
      user_id: userId,
      ended_at: { gt: since },
    },
  });

  const newNonPauseErrorCount = await prisma.wordErrorEvent.count({
    where: {
      error_type: { not: "pause" },
      word_mistake: {
        typing_result: {
          user_id: userId,
          ended_at: { gt: since },
        },
      },
    },
  });

  if (
    newSessionCount >= SESSIONS_BEFORE_RECOACH ||
    newNonPauseErrorCount >= ERRORS_BEFORE_RECOACH
  ) {
    return { shouldRun: true };
  }

  return { shouldRun: false };
}

export async function preflightFirstCoachGeneration(
  userId: string
): Promise<{ shouldRun: boolean }> {
  return preflightCoachGeneration(userId);
}
