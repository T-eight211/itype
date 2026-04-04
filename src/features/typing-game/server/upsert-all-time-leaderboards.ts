import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

function shouldUpdateBest(prevWpm: number | null | undefined, newWpm: number): boolean {
  if (prevWpm == null || Number.isNaN(prevWpm)) return true;
  return newWpm > prevWpm;
}

async function upsertAllTime60s(
  tx: Tx,
  clerkUserId: string,
  typingResultId: number,
  newWpm: number
): Promise<void> {
  const existing = await tx.leaderboardAllTime60s.findUnique({
    where: { user_id: clerkUserId },
    include: { typing_result: { select: { wpm: true } } },
  });

  if (!shouldUpdateBest(existing?.typing_result?.wpm ?? null, newWpm)) return;

  if (existing) {
    await tx.leaderboardAllTime60s.update({
      where: { user_id: clerkUserId },
      data: { typing_result_id: typingResultId },
    });
  } else {
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

  if (mode !== "time") return;
  if (targetTimeSeconds !== 60 && targetTimeSeconds !== 15) return;

  if (targetTimeSeconds === 60) {
    await upsertAllTime60s(tx, clerkUserId, typingResultId, newWpm);
  }
  if (targetTimeSeconds === 15) {
    await upsertAllTime15s(tx, clerkUserId, typingResultId, newWpm);
  }
}
