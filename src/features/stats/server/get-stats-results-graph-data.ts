import type { Prisma } from "@/generated/prisma/client";
import {
  STATS_GRAPH_QUOTE_LENGTHS,
  STATS_GRAPH_TIME_PRESETS,
  STATS_GRAPH_WORD_PRESETS,
  statsGraphRangeCutoff,
  type StatsGraphFilters,
} from "@/features/stats/lib/stats-results-graph-filters";
import { prisma } from "@/lib/prisma";

export type StatsGameGraphPoint = {
  id: number;
  endedAt: string;
  wpm: number | null;
  rawWpm: number | null;
  accuracy: number | null;
  consistency: number | null;
  elapsedSeconds: number | null;
  gameMode: string | null;
  punctuation: boolean;
  numbers: boolean;
  targetTimeSeconds: number | null;
  targetWordCount: number | null;
  quoteLength: string | null;
};

function timePresetList(filters: StatsGraphFilters): number[] {
  const set = new Set(
    filters.timeSeconds.filter((n) =>
      (STATS_GRAPH_TIME_PRESETS as readonly number[]).includes(n)
    )
  );
  return set.size ? [...set].sort((a, b) => a - b) : [...STATS_GRAPH_TIME_PRESETS];
}

function wordPresetList(filters: StatsGraphFilters): number[] {
  const set = new Set(
    filters.wordCounts.filter((n) => (STATS_GRAPH_WORD_PRESETS as readonly number[]).includes(n))
  );
  return set.size ? [...set].sort((a, b) => a - b) : [...STATS_GRAPH_WORD_PRESETS];
}

function quoteLengthList(filters: StatsGraphFilters): string[] {
  const allowed = new Set<string>(STATS_GRAPH_QUOTE_LENGTHS as unknown as string[]);
  const picked = filters.quoteLengths.filter((s) => allowed.has(s));
  return picked.length ? picked : [...STATS_GRAPH_QUOTE_LENGTHS];
}

function modeBranches(filters: StatsGraphFilters): Prisma.TypingResultsWhereInput | null {
  if (!filters.modes.length) return null;

  const branches: Prisma.TypingResultsWhereInput[] = [];
  const times = timePresetList(filters);
  const words = wordPresetList(filters);
  const quotes = quoteLengthList(filters);

  if (filters.modes.includes("time") && times.length) {
    branches.push({
      game_mode: "time",
      target_time_seconds: { in: times },
    });
  }
  if (filters.modes.includes("words") && words.length) {
    branches.push({
      game_mode: "words",
      target_word_count: { in: words },
    });
  }
  if (filters.modes.includes("quote") && quotes.length) {
    branches.push({
      game_mode: "quote",
      quote_length: { in: quotes },
    });
  }

  if (!branches.length) return null;
  return { OR: branches };
}

function buildWhere(userId: string, filters: StatsGraphFilters): Prisma.TypingResultsWhereInput {
  const cutoff = statsGraphRangeCutoff(filters.range);

  const clauses: Prisma.TypingResultsWhereInput[] = [
    { user_id: userId },
    {
      ended_at: {
        not: null,
        ...(cutoff ? { gte: cutoff } : {}),
      },
    },
  ];

  const modeClause = modeBranches(filters);
  if (modeClause) {
    clauses.push(modeClause);
  }

  if (filters.punctuation === "off") {
    clauses.push({ OR: [{ punctuation: false }, { punctuation: null }] });
  } else if (filters.punctuation === "on") {
    clauses.push({ punctuation: true });
  }

  if (filters.numbers === "off") {
    clauses.push({ OR: [{ numbers: false }, { numbers: null }] });
  } else if (filters.numbers === "on") {
    clauses.push({ numbers: true });
  }

  return { AND: clauses };
}

export async function getStatsResultsGraphData(
  userId: string,
  filters: StatsGraphFilters
): Promise<StatsGameGraphPoint[]> {
  const rows = await prisma.typingResults.findMany({
    where: buildWhere(userId, filters),
    orderBy: [{ ended_at: "asc" }, { id: "asc" }],
    select: {
      id: true,
      ended_at: true,
      wpm: true,
      raw_wpm: true,
      accuracy: true,
      consistency: true,
      elapsed_seconds: true,
      game_mode: true,
      punctuation: true,
      numbers: true,
      target_time_seconds: true,
      target_word_count: true,
      quote_length: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    endedAt: r.ended_at!.toISOString(),
    wpm: r.wpm,
    rawWpm: r.raw_wpm,
    accuracy: r.accuracy,
    consistency: r.consistency,
    elapsedSeconds: r.elapsed_seconds,
    gameMode: r.game_mode,
    punctuation: r.punctuation === true,
    numbers: r.numbers === true,
    targetTimeSeconds: r.target_time_seconds,
    targetWordCount: r.target_word_count,
    quoteLength: r.quote_length,
  }));
}
