export type StatsGraphGameMode = "time" | "words" | "quote";

export type StatsGraphRange = "day" | "week" | "month" | "3months" | "all";

export type StatsGraphTriBool = "off" | "on" | "both";

export const STATS_GRAPH_TIME_PRESETS = [15, 30, 60, 90] as const;

export const STATS_GRAPH_WORD_PRESETS = [10, 25, 50, 100] as const;

export const STATS_GRAPH_QUOTE_LENGTHS = ["all", "short", "medium", "long", "thicc"] as const;

export type StatsGraphQuoteLength = (typeof STATS_GRAPH_QUOTE_LENGTHS)[number];

export type StatsGraphFilters = {
  range: StatsGraphRange;
  /** Empty = include time, words, and quote games */
  modes: StatsGraphGameMode[];
  /** Used when `time` is in `modes`. Empty coerces to all time presets */
  timeSeconds: number[];
  /** Used when `words` is in `modes`. Empty coerces to all word presets */
  wordCounts: number[];
  /** Used when `quote` is in `modes`. Empty coerces to all quote lengths */
  quoteLengths: string[];
  punctuation: StatsGraphTriBool;
  numbers: StatsGraphTriBool;
};

export const DEFAULT_STATS_GRAPH_FILTERS: StatsGraphFilters = {
  range: "month",
  modes: ["time", "words", "quote"],
  timeSeconds: [...STATS_GRAPH_TIME_PRESETS],
  wordCounts: [...STATS_GRAPH_WORD_PRESETS],
  quoteLengths: [...STATS_GRAPH_QUOTE_LENGTHS],
  punctuation: "both",
  numbers: "both",
};

export function statsGraphRangeCutoff(range: StatsGraphRange): Date | null {
  if (range === "all") return null;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  switch (range) {
    case "day":
      return new Date(now - day);
    case "week":
      return new Date(now - 7 * day);
    case "month":
      return new Date(now - 30 * day);
    case "3months":
      return new Date(now - 90 * day);
    default:
      return null;
  }
}
