import { prisma } from "@/lib/prisma";

const TIME_PRESETS = [15, 30, 60, 90] as const;
const WORD_PRESETS = [10, 25, 50, 100] as const;

// One card value for a time or word preset. Null values mean the user has not
// completed that preset yet.
type RecentPresetStat = {
  preset: number;
  wpm: number | null;
  rawWpm: number | null;
  accuracy: number | null;
  consistency: number | null;
  endedAt: string | null;
};

export type RecentGamesStats = {
  time: RecentPresetStat[];
  words: RecentPresetStat[];
};

function emptyPresetStat(preset: number): RecentPresetStat {
  // Placeholder used when there is no saved result for a preset.
  return {
    preset,
    wpm: null,
    rawWpm: null,
    accuracy: null,
    consistency: null,
    endedAt: null,
  };
}

function mapLatestByPreset(
  presets: readonly number[],
  rows: Array<{
    target_time_seconds?: number | null;
    target_word_count?: number | null;
    wpm: number | null;
    raw_wpm: number | null;
    accuracy: number | null;
    consistency: number | null;
    ended_at: Date | null;
  }>,
  presetKey: "target_time_seconds" | "target_word_count"
): RecentPresetStat[] {
  // Map stores the newest row found for each preset. The query is already sorted
  // newest first, so the first time a preset appears it is the latest result.
  const latest = new Map<number, RecentPresetStat>();

  for (const row of rows) {
    const preset = row[presetKey];
    if (preset == null || latest.has(preset)) continue;

    latest.set(preset, {
      preset,
      wpm: row.wpm,
      rawWpm: row.raw_wpm,
      accuracy: row.accuracy,
      consistency: row.consistency,
      endedAt: row.ended_at?.toISOString() ?? null,
    });
  }

  // Return results in fixed preset order. Missing presets get placeholders so
  // the UI always renders the same cards.
  return presets.map((preset) => latest.get(preset) ?? emptyPresetStat(preset));
}

export async function getRecentGamesStats(userId: string): Promise<RecentGamesStats> {
  // Time-mode and word-mode recent preset queries are independent, so run them
  // together.
  const [timeRows, wordRows] = await Promise.all([
    prisma.typingResults.findMany({
      where: {
        // Only fetch this user's completed time games for supported time presets.
        user_id: userId,
        game_mode: "time",
        target_time_seconds: { in: [...TIME_PRESETS] },
      },
      // Newest rows come first, so mapLatestByPreset can keep the first row per
      // preset.
      orderBy: [{ ended_at: "desc" }, { id: "desc" }],
      select: {
        target_time_seconds: true,
        wpm: true,
        raw_wpm: true,
        accuracy: true,
        consistency: true,
        ended_at: true,
      },
    }),
    prisma.typingResults.findMany({
      where: {
        // Same query shape for word-count presets.
        user_id: userId,
        game_mode: "words",
        target_word_count: { in: [...WORD_PRESETS] },
      },
      orderBy: [{ ended_at: "desc" }, { id: "desc" }],
      select: {
        target_word_count: true,
        wpm: true,
        raw_wpm: true,
        accuracy: true,
        consistency: true,
        ended_at: true,
      },
    }),
  ]);

  return {
    time: mapLatestByPreset(TIME_PRESETS, timeRows, "target_time_seconds"),
    words: mapLatestByPreset(WORD_PRESETS, wordRows, "target_word_count"),
  };
}
