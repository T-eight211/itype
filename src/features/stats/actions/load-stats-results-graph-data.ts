"use server";

import { auth } from "@clerk/nextjs/server";
import {
  DEFAULT_STATS_GRAPH_FILTERS,
  STATS_GRAPH_QUOTE_LENGTHS,
  STATS_GRAPH_TIME_PRESETS,
  STATS_GRAPH_WORD_PRESETS,
  type StatsGraphFilters,
  type StatsGraphGameMode,
  type StatsGraphRange,
  type StatsGraphTriBool,
} from "@/features/stats/lib/stats-results-graph-filters";
import {
  getStatsResultsGraphData,
  type StatsGameGraphPoint,
} from "@/features/stats/server/get-stats-results-graph-data";

const RANGES: StatsGraphRange[] = ["day", "week", "month", "3months", "all"];
const TRI: StatsGraphTriBool[] = ["off", "on", "both"];
const MODE_SET = new Set<StatsGraphGameMode>(["time", "words", "quote"]);

function coerceModes(raw: unknown): StatsGraphGameMode[] {
  if (!Array.isArray(raw)) return [];
  const out: StatsGraphGameMode[] = [];
  for (const x of raw) {
    if (typeof x === "string" && MODE_SET.has(x as StatsGraphGameMode)) {
      out.push(x as StatsGraphGameMode);
    }
  }
  return out;
}

function coerceNumberSubset(raw: unknown, allowed: readonly number[]): number[] {
  if (!Array.isArray(raw)) return [...allowed];
  const set = new Set<number>();
  for (const x of raw) {
    const n = typeof x === "number" ? x : Number(x);
    if (Number.isFinite(n) && (allowed as readonly number[]).includes(n)) {
      set.add(n);
    }
  }
  return set.size ? [...set].sort((a, b) => a - b) : [...allowed];
}

function coerceQuoteLengths(raw: unknown): string[] {
  const allowed = new Set<string>(STATS_GRAPH_QUOTE_LENGTHS as unknown as string[]);
  if (!Array.isArray(raw)) return [...STATS_GRAPH_QUOTE_LENGTHS];
  const picked = raw.filter((s): s is string => typeof s === "string" && allowed.has(s));
  return picked.length ? picked : [...STATS_GRAPH_QUOTE_LENGTHS];
}

function coerceFilters(raw: Partial<StatsGraphFilters> | undefined): StatsGraphFilters {
  if (!raw || typeof raw !== "object") return DEFAULT_STATS_GRAPH_FILTERS;
  return {
    range: RANGES.includes(raw.range as StatsGraphRange) ? (raw.range as StatsGraphRange) : DEFAULT_STATS_GRAPH_FILTERS.range,
    modes: coerceModes(raw.modes),
    timeSeconds: coerceNumberSubset(raw.timeSeconds, STATS_GRAPH_TIME_PRESETS),
    wordCounts: coerceNumberSubset(raw.wordCounts, STATS_GRAPH_WORD_PRESETS),
    quoteLengths: coerceQuoteLengths(raw.quoteLengths),
    punctuation: TRI.includes(raw.punctuation as StatsGraphTriBool)
      ? (raw.punctuation as StatsGraphTriBool)
      : DEFAULT_STATS_GRAPH_FILTERS.punctuation,
    numbers: TRI.includes(raw.numbers as StatsGraphTriBool)
      ? (raw.numbers as StatsGraphTriBool)
      : DEFAULT_STATS_GRAPH_FILTERS.numbers,
  };
}

export async function loadStatsResultsGraphData(
  filters?: Partial<StatsGraphFilters>
): Promise<StatsGameGraphPoint[]> {
  const { userId } = await auth();
  if (!userId) return [];
  return getStatsResultsGraphData(userId, coerceFilters(filters));
}
