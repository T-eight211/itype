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
  // This object is the simplified row shape sent from the server to the chart
  // components. It uses frontend-friendly camelCase names.
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
  // Keep only supported time presets and remove duplicates with Set. If nothing
  // valid is selected, fall back to all time presets.
  const set = new Set(
    filters.timeSeconds.filter((n) =>
      (STATS_GRAPH_TIME_PRESETS as readonly number[]).includes(n)
    )
  );
  return set.size ? [...set].sort((a, b) => a - b) : [...STATS_GRAPH_TIME_PRESETS];
}

function wordPresetList(filters: StatsGraphFilters): number[] {
  // Same validation for word-count presets.
  const set = new Set(
    filters.wordCounts.filter((n) => (STATS_GRAPH_WORD_PRESETS as readonly number[]).includes(n))
  );
  return set.size ? [...set].sort((a, b) => a - b) : [...STATS_GRAPH_WORD_PRESETS];
}

function quoteLengthList(filters: StatsGraphFilters): string[] {
  // Quote length values are strings, so use a Set of allowed values to filter
  // out anything unsafe or unsupported.
  const allowed = new Set<string>(STATS_GRAPH_QUOTE_LENGTHS as unknown as string[]);
  const picked = filters.quoteLengths.filter((s) => allowed.has(s));
  return picked.length ? picked : [...STATS_GRAPH_QUOTE_LENGTHS];
}

function modeBranches(filters: StatsGraphFilters): Prisma.TypingResultsWhereInput | null {
  // Build the OR part of the Prisma query. Each selected mode becomes one branch
  // with its own preset filter.
  if (!filters.modes.length) return null;

  const branches: Prisma.TypingResultsWhereInput[] = [];
  const times = timePresetList(filters);
  const words = wordPresetList(filters);
  const quotes = quoteLengthList(filters);

  if (filters.modes.includes("time") && times.length) {
    branches.push({
      game_mode: "time",
      // Prisma `in` means target_time_seconds must match one of these values.
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
  // OR means a row can match any selected mode branch.
  return { OR: branches };
}

function buildWhere(userId: string, filters: StatsGraphFilters): Prisma.TypingResultsWhereInput {
  // Convert the selected time range into a Date. Null means "all time".
  const cutoff = statsGraphRangeCutoff(filters.range);

  // The clauses array is later joined with AND, meaning every condition must be
  // true for a typing result to be included.
  const clauses: Prisma.TypingResultsWhereInput[] = [
    // Always limit stats to the signed-in user's rows.
    { user_id: userId },
    {
      ended_at: {
        // `not: null` filters out incomplete or unsaved result rows.
        not: null,
        // `gte` means ended_at must be greater than or equal to the cutoff date.
        ...(cutoff ? { gte: cutoff } : {}),
      },
    },
  ];

  const modeClause = modeBranches(filters);
  if (modeClause) {
    clauses.push(modeClause);
  }

  if (filters.punctuation === "off") {
    // Treat false and null as "punctuation off" for older rows.
    clauses.push({ OR: [{ punctuation: false }, { punctuation: null }] });
  } else if (filters.punctuation === "on") {
    clauses.push({ punctuation: true });
  }

  if (filters.numbers === "off") {
    // Treat false and null as "numbers off" for older rows.
    clauses.push({ OR: [{ numbers: false }, { numbers: null }] });
  } else if (filters.numbers === "on") {
    clauses.push({ numbers: true });
  }

  // Return one Prisma where object. AND combines user, date, mode, punctuation
  // and number filters into one database query.
  return { AND: clauses };
}

export async function getStatsResultsGraphData(
  userId: string,
  filters: StatsGraphFilters
): Promise<StatsGameGraphPoint[]> {
  // Main query for the results graph. It fetches raw completed game rows for the
  // selected filters; averages and chart summaries are calculated later in React.
  const rows = await prisma.typingResults.findMany({
    where: buildWhere(userId, filters),
    // Oldest first lets the chart draw progress from left to right.
    orderBy: [{ ended_at: "asc" }, { id: "asc" }],
    // Select only the fields needed by stats charts and tables.
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

  // Map database snake_case fields into the camelCase object used by components.
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
