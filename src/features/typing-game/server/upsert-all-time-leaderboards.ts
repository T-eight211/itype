import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

function shouldUpdateBest(prevWpm: number | null | undefined, newWpm: number): boolean {
  // Leaderboard rows only update when there is no previous score or the new WPM
  // is higher than the saved best.
  if (prevWpm == null || Number.isNaN(prevWpm)) return true;
  return newWpm > prevWpm;
}

async function upsertAllTime60s(
  tx: Tx,
  clerkUserId: string,
  typingResultId: number,
  newWpm: number
): Promise<void> {
  // All-time 60s stores one best result per user.
  // findUnique works here because user_id is unique in the Prisma model.
  const existing = await tx.leaderboardAllTime60s.findUnique({
    where: { user_id: clerkUserId },
    include: { typing_result: { select: { wpm: true } } },
  });

  // If the saved best is faster, do nothing. The new result still remains in
  // TypingResults, but it does not become the leaderboard entry.
  if (!shouldUpdateBest(existing?.typing_result?.wpm ?? null, newWpm)) return;

  if (existing) {
    // Existing row means the user has a previous 60s best, so point it at the
    // newer typing result.
    await tx.leaderboardAllTime60s.update({
      where: { user_id: clerkUserId },
      data: { typing_result_id: typingResultId },
    });
  } else {
    // No row exists yet, so create the user's first all-time 60s entry.
    await tx.leaderboardAllTime60s.create({
      data: {
        user_id: clerkUserId,
        typing_result_id: typingResultId,
      },
    });
  }
}

async function upsertAllTime15s(
  tx: Tx,
  clerkUserId: string,
  typingResultId: number,
  newWpm: number
): Promise<void> {
  // All-time 15s uses the same best-score rule as the 60s leaderboard.
  // Only the table changes; the update logic is identical.
  const existing = await tx.leaderboardAllTime15s.findUnique({
    where: { user_id: clerkUserId },
    include: { typing_result: { select: { wpm: true } } },
  });

  if (!shouldUpdateBest(existing?.typing_result?.wpm ?? null, newWpm)) return;

  if (existing) {
    await tx.leaderboardAllTime15s.update({
      where: { user_id: clerkUserId },
      data: { typing_result_id: typingResultId },
    });
  } else {
    await tx.leaderboardAllTime15s.create({
      data: {
        user_id: clerkUserId,
        typing_result_id: typingResultId,
      },
    });
  }
}

export async function upsertAllTimeLeaderboardsForResult(
  tx: Tx,
  params: {
    clerkUserId: string;
    typingResultId: number;
    newWpm: number;
    mode: "time" | "words" | "quote";
    targetTimeSeconds: number | null | undefined;
  }
): Promise<void> {
  const { clerkUserId, typingResultId, newWpm, mode, targetTimeSeconds } = params;

  // Only fixed time-mode games are eligible for these leaderboards.
  // Quote mode and word-count mode are not directly comparable with fixed-time
  // runs, so they are not inserted into these boards.
  if (mode !== "time") return;
  if (targetTimeSeconds !== 60 && targetTimeSeconds !== 15) return;

  // Route the result to the correct all-time table based on the selected timer.
  if (targetTimeSeconds === 60) {
    await upsertAllTime60s(tx, clerkUserId, typingResultId, newWpm);
  }
  if (targetTimeSeconds === 15) {
    await upsertAllTime15s(tx, clerkUserId, typingResultId, newWpm);
  }
}
