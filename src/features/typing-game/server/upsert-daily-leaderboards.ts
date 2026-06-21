import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export function utcCalendarDateFromInstant(instant: Date): Date {
  // Daily leaderboard dates are normalised to midnight UTC, not the user's local
  // timezone, so all users are compared against the same day boundary.
  // The returned Date has the time set to 00:00:00 UTC and is stored in the
  // leaderboard_date date column.
  return new Date(
    Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate())
  );
}

function shouldUpdateBest(prevWpm: number | null | undefined, newWpm: number): boolean {
  // Daily rows keep the best WPM for that user on that UTC date.
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
  // Find this user's current 60s entry for the same leaderboard date.
  // Daily tables use one row per user per UTC day, so this checks whether the
  // user already has a best score for today.
  const existing = await tx.leaderboardDaily60s.findFirst({
    where: {
      user_id: clerkUserId,
      leaderboard_date: leaderboardDateUtc,
    },
    include: { typing_result: { select: { wpm: true } } },
  });

  // If today's existing result has a better WPM, leave the daily leaderboard
  // unchanged.
  if (!shouldUpdateBest(existing?.typing_result?.wpm ?? null, newWpm)) return;

  if (existing) {
    // Replace the linked result if the new game beats the stored daily best.
    await tx.leaderboardDaily60s.update({
      where: { id: existing.id },
      data: { typing_result_id: typingResultId },
    });
  } else {
    // Create the first daily 60s entry for this user/date.
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
  // Same daily best behaviour for 15 second games.
  // The linked TypingResults row is replaced only when the new WPM is higher.
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

  // Daily leaderboards only include fixed 15s and 60s time-mode games.
  // This keeps daily rankings fair because every entry used the same time limit.
  if (mode !== "time") return;
  if (targetTimeSeconds !== 60 && targetTimeSeconds !== 15) return;

  // Use the completion timestamp of the game to decide the leaderboard day.
  const leaderboardDateUtc = utcCalendarDateFromInstant(endedAt);

  // Route the completed result to the correct daily table.
  if (targetTimeSeconds === 60) {
    await upsertDaily60s(tx, clerkUserId, typingResultId, newWpm, leaderboardDateUtc);
  }
  if (targetTimeSeconds === 15) {
    await upsertDaily15s(tx, clerkUserId, typingResultId, newWpm, leaderboardDateUtc);
  }
}
