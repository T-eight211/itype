import "server-only";

import { prisma } from "@/lib/prisma";

import { getTypingCoachAIEligibilityForUser } from "./get-ai-aggregate";

const SESSIONS_BEFORE_RECOACH = 10;
const ERRORS_BEFORE_RECOACH = 20;

export async function preflightCoachGeneration(
  userId: string
): Promise<{ shouldRun: boolean }> {
  // Do not start another AI run if one is already pending for this user.
  const pendingRun = await prisma.typingCoachAiRun.findFirst({
    where: { user_id: userId, status: "pending" },
    select: { id: true },
  });
  if (pendingRun) return { shouldRun: false };

  // First check the main eligibility thresholds: enough recent sessions and
  // enough recent non-pause errors.
  const eligibility = await getTypingCoachAIEligibilityForUser(userId);
  if (!eligibility.ready) return { shouldRun: false };

  // Find the most recent completed run. If none exists, this is the first AI run.
  const lastCompleted = await prisma.typingCoachAiRun.findFirst({
    where: { user_id: userId, status: "completed" },
    orderBy: { completed_at: "desc" },
    select: { completed_at: true },
  });

  if (!lastCompleted?.completed_at) {
    // User is eligible and has never had completed feedback, so run now.
    return { shouldRun: true };
  }

  // For later runs, only count new typing data after the last completed AI run.
  const since = lastCompleted.completed_at;

  // Re-coach if enough new saved games were completed since the last run.
  const newSessionCount = await prisma.typingResults.count({
    where: {
      user_id: userId,
      ended_at: { gt: since },
    },
  });

  // Or re-coach if enough new non-pause error events were created since the last
  // run. This follows relations from error event to word mistake to typing result.
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
    // Either threshold is enough to trigger a new AI run.
    return { shouldRun: true };
  }

  return { shouldRun: false };
}

export async function preflightFirstCoachGeneration(
  userId: string
): Promise<{ shouldRun: boolean }> {
  // Kept as an alias for older call sites; it now uses the same preflight logic.
  return preflightCoachGeneration(userId);
}
