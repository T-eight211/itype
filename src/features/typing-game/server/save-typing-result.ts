"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).typing_results.create({
      data: {
        user_id: userId,
        wpm,
        raw_wpm: rawWpm,
        accuracy,
        consistency: consistency ?? undefined,
        ended_at: new Date(),
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
    });
    return { ok: true };
  } catch (err) {
    console.error("saveTypingResult error:", err);
    return { error: String(err) };
  }
}
