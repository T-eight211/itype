"use server";
// This file is a server action module. Code here runs on the backend, so it can
// safely use Clerk server auth and Prisma database access.

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { upsertAllTimeLeaderboardsForResult } from "./upsert-all-time-leaderboards";
import { upsertDailyLeaderboardsForResult } from "./upsert-daily-leaderboards";

export type SaveTypingResultInput = {
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number | null;
  elapsedSeconds: number;
  mode: "time" | "words" | "quote";
  language: string;
  punctuation: boolean;
  numbers: boolean;
  quoteId?: string | null;
  quoteSource?: "quotable" | "local" | null;
  quoteLength?: string | null;
  targetTimeSeconds?: number | null;
  targetWordCount?: number | null;
  wpmHistory: number[];
  rawWpmHistory: number[];
  burstWpm: number[];
  incorrectHistory: number[];
};

export async function saveTypingResult(input: SaveTypingResultInput) {
  // Clerk auth identifies the signed-in user on the server. Results are only
  // saved when a user is authenticated.
  const { userId } = await auth();
  if (!userId) return { error: "Not signed in" };

  const {
    wpm,
    rawWpm,
    accuracy,
    consistency,
    elapsedSeconds,
    mode,
    language,
    punctuation,
    numbers,
    quoteId,
    quoteSource,
    quoteLength,
    targetTimeSeconds,
    targetWordCount,
    wpmHistory,
    rawWpmHistory,
    burstWpm,
    incorrectHistory,
  } = input;

  try {
    // A transaction keeps the user row, typing result and leaderboard updates
    // consistent. If one write fails, the database rolls the group back.
    const resultId = await prisma.$transaction(async (tx) => {
      const endedAt = new Date();
      // Ensure the local user row exists before linking a result to it.
      await tx.user.upsert({
        where: { user_id: userId },
        create: { user_id: userId },
        update: {},
      });

      // Store the completed game session and its history arrays for the result
      // page and statistics dashboard.
      const result = await tx.typingResults.create({
        data: {
          user_id: userId,
          wpm,
          raw_wpm: rawWpm,
          accuracy,
          consistency: consistency ?? undefined,
          ended_at: endedAt,
          elapsed_seconds: elapsedSeconds,
          game_mode: mode,
          target_time_seconds: mode === "time" ? (targetTimeSeconds ?? undefined) : undefined,
          target_word_count: mode === "words" ? (targetWordCount ?? undefined) : undefined,
          quote_length: mode === "quote" ? (quoteLength ?? undefined) : undefined,
          language,
          punctuation,
          numbers,
          quote_id: quoteId ?? undefined,
          quote_source: quoteSource ?? undefined,
          wpm_history: wpmHistory,
          raw_wpm_history: rawWpmHistory,
          burst_wpm: burstWpm,
          incorrect_history: incorrectHistory,
        },
        select: { id: true, wpm: true },
      });

      const newWpm = result.wpm ?? wpm;

      // Leaderboards store the best eligible 15s/60s time-mode result.
      // The leaderboard row links back to this new TypingResults id if it beats
      // the user's previous best for that board.
      await upsertAllTimeLeaderboardsForResult(tx, {
        clerkUserId: userId,
        typingResultId: result.id,
        newWpm,
        mode,
        targetTimeSeconds,
      });

      // Daily leaderboards use the UTC date from the completed result.
      // This is in the same transaction as the result save, so the leaderboard
      // cannot update without the matching TypingResults row existing.
      await upsertDailyLeaderboardsForResult(tx, {
        clerkUserId: userId,
        typingResultId: result.id,
        newWpm,
        mode,
        targetTimeSeconds,
        endedAt,
      });
      return result.id;
    });
    return { ok: true, typingResultId: resultId };
  } catch (err) {
    console.error("saveTypingResult error:", err);
    return { error: String(err) };
  }
}
