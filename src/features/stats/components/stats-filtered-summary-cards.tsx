// This file was adapted from the blocks stats:
// https://blocks.so/stats

"use client";

import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import type { StatsGameGraphPoint } from "@/features/stats/server/get-stats-results-graph-data";

type MetricKey = "wpm" | "rawWpm" | "accuracy" | "consistency";

const MAX_NON_TIME_SESSION_SECONDS = 2 * 60 * 60;

function saneElapsedSeconds(row: StatsGameGraphPoint): number {
  // Use a safe elapsed time so one bad or very large saved value does not distort
  // the total typing time summary.
  const elapsed = row.elapsedSeconds;
  if (elapsed == null || !Number.isFinite(elapsed) || elapsed <= 0) return 0;
  if (row.gameMode === "time" && row.targetTimeSeconds != null && row.targetTimeSeconds > 0) {
    return Math.min(elapsed, row.targetTimeSeconds + 10);
  }
  return Math.min(elapsed, MAX_NON_TIME_SESSION_SECONDS);
}

function toMetricValues(games: StatsGameGraphPoint[], key: MetricKey): number[] {
  // Extract one metric from every game and remove null or invalid values before
  // calculating averages or maximums.
  return games
    .map((g) => g[key])
    .filter((v): v is number => v != null && Number.isFinite(v));
}

function mean(values: number[]): number | null {
  // Mean average = sum of values divided by number of values.
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function formatHms(totalSeconds: number): string {
  // Format seconds as HH:MM:SS for display.
  const safe = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatMetric(value: number | null, asPercent = false): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return asPercent ? `${value.toFixed(2)}%` : value.toFixed(2);
}

type StatItem = {
  label: string;
  value: string;
};

type Props = {
  games: StatsGameGraphPoint[];
};

export function StatsFilteredSummaryCards({ games }: Props) {
  // useMemo caches the calculated cards until the filtered games array changes.
  // This avoids recalculating every summary on unrelated re-renders.
  const items = React.useMemo((): StatItem[] => {
    const wpmValues = toMetricValues(games, "wpm");
    const rawValues = toMetricValues(games, "rawWpm");
    const accValues = toMetricValues(games, "accuracy");
    const conValues = toMetricValues(games, "consistency");

    // Last 10 summaries show recent performance within the currently filtered
    // result set.
    const last10 = games.slice(-10);
    const wpmLast10 = toMetricValues(last10, "wpm");
    const rawLast10 = toMetricValues(last10, "rawWpm");
    const accLast10 = toMetricValues(last10, "accuracy");
    const conLast10 = toMetricValues(last10, "consistency");

    // Total time typing is calculated locally from the filtered rows already
    // loaded into the chart.
    const timeTypingSeconds = games.reduce((sum, g) => sum + saneElapsedSeconds(g), 0);

    return [
      { label: "Tests completed", value: String(games.length) },
      { label: "Time typing", value: formatHms(timeTypingSeconds) },

      { label: "WPM highest", value: formatMetric(wpmValues.length ? Math.max(...wpmValues) : null) },
      { label: "WPM avg", value: formatMetric(mean(wpmValues)) },
      { label: "WPM avg (last 10)", value: formatMetric(mean(wpmLast10)) },

      { label: "Raw highest", value: formatMetric(rawValues.length ? Math.max(...rawValues) : null) },
      { label: "Raw avg", value: formatMetric(mean(rawValues)) },
      { label: "Raw avg (last 10)", value: formatMetric(mean(rawLast10)) },

      { label: "Accuracy highest", value: formatMetric(accValues.length ? Math.max(...accValues) : null, true) },
      { label: "Accuracy avg", value: formatMetric(mean(accValues), true) },
      { label: "Accuracy avg (last 10)", value: formatMetric(mean(accLast10), true) },

      { label: "Consistency highest", value: formatMetric(conValues.length ? Math.max(...conValues) : null, true) },
      { label: "Consistency avg", value: formatMetric(mean(conValues), true) },
      { label: "Consistency avg (last 10)", value: formatMetric(mean(conLast10), true) },
    ];
  }, [games]);

  const topItems = items.slice(0, 2);
  const restItems = items.slice(2);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {topItems.map((item) => (
          <Card key={item.label} className="py-0 shadow-2xs">
            <CardContent className="px-5 py-4">
              <div className="text-xs text-muted-foreground">{item.label}</div>
              <div className="mt-2 font-mono text-2xl font-semibold text-foreground">{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {restItems.map((item) => (
          <Card key={item.label} className="py-0 shadow-2xs">
            <CardContent className="px-5 py-4">
              <div className="text-xs text-muted-foreground">{item.label}</div>
              <div className="mt-2 font-mono text-2xl font-semibold text-foreground">{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
