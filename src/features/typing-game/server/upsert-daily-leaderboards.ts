import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export function utcCalendarDateFromInstant(instant: Date): Date {
  return new Date(
    Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate())
  );
}

function shouldUpdateBest(prevWpm: number | null | undefined, newWpm: number): boolean {
  if (prevWpm == null || Number.isNaN(prevWpm)) return true;
  return newWpm > prevWpm;
}

async function upsertDaily60s(
  tx: Tx,
  clerkUserId: string,
  typingResultId: number,
  newWpm: number,
  leaderboardDateUtc: Date
): Promise<void> {
  const existing = await tx.leaderboardDaily60s.findFirst({
    where: {
      user_id: clerkUserId,
      leaderboard_date: leaderboardDateUtc,
    },
    include: { typing_result: { select: { wpm: true } } },
  });

  if (!shouldUpdateBest(existing?.typing_result?.wpm ?? null, newWpm)) return;

  if (existing) {
    await tx.leaderboardDaily60s.update({
      where: { id: existing.id },
      data: { typing_result_id: typingResultId },
    });
  } else {
    await tx.leaderboardDaily60s.create({
      data: {
        user_id: clerkUserId,
        typing_result_id: typingResultId,
        leaderboard_date: leaderboardDateUtc,
      },
    });
  }
}

async function upsertDaily15s(
  tx: Tx,
  clerkUserId: string,
  typingResultId: number,
  newWpm: number,
  leaderboardDateUtc: Date
): Promise<void> {
  const existing = await tx.leaderboardDaily15s.findFirst({
    where: {
      user_id: clerkUserId,
      leaderboard_date: leaderboardDateUtc,
    },
    include: { typing_result: { select: { wpm: true } } },
  });

  if (!shouldUpdateBest(existing?.typing_result?.wpm ?? null, newWpm)) return;

  if (existing) {
    await tx.leaderboardDaily15s.update({
      where: { id: existing.id },
      data: { typing_result_id: typingResultId },
    });
  } else {
    await tx.leaderboardDaily15s.create({
      data: {
        user_id: clerkUserId,
        typing_result_id: typingResultId,
        leaderboard_date: leaderboardDateUtc,
      },
    });
  }
}

export async function upsertDailyLeaderboardsForResult(
  tx: Tx,
  params: {
    clerkUserId: string;
    typingResultId: number;
    newWpm: number;
    mode: "time" | "words" | "quote";
    targetTimeSeconds: number | null | undefined;
    endedAt: Date;
  }
): Promise<void> {
  const { clerkUserId, typingResultId, newWpm, mode, targetTimeSeconds, endedAt } = params;

  if (mode !== "time") return;
  if (targetTimeSeconds !== 60 && targetTimeSeconds !== 15) return;

  const leaderboardDateUtc = utcCalendarDateFromInstant(endedAt);

  if (targetTimeSeconds === 60) {
    await upsertDaily60s(tx, clerkUserId, typingResultId, newWpm, leaderboardDateUtc);
  }
  if (targetTimeSeconds === 15) {
    await upsertDaily15s(tx, clerkUserId, typingResultId, newWpm, leaderboardDateUtc);
  }
}
