import { prisma } from "@/lib/prisma";

const TIME_PRESETS = [15, 30, 60, 90] as const;
const WORD_PRESETS = [10, 25, 50, 100] as const;

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

  return presets.map((preset) => latest.get(preset) ?? emptyPresetStat(preset));
}

export async function getRecentGamesStats(userId: string): Promise<RecentGamesStats> {
  const [timeRows, wordRows] = await Promise.all([
    prisma.typingResults.findMany({
      where: {
        user_id: userId,
        game_mode: "time",
        target_time_seconds: { in: [...TIME_PRESETS] },
      },
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
