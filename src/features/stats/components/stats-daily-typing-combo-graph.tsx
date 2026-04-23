"use client";

import * as React from "react";
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { StatsGameGraphPoint } from "@/features/stats/server/get-stats-results-graph-data";

const chartConfig = {
  minutes: {
    label: "Time typing (minutes)",
    color: "var(--chart-2)",
  },
  avgWpm: {
    label: "Average WPM",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

type DailyRow = {
  dateKey: string;
  minutes: number;
  testsCompleted: number;
  highestWpm: number | null;
  avgWpm: number | null;
  avgAccuracy: number | null;
  avgConsistency: number | null;
  totalSeconds: number;
};

const MAX_NON_TIME_SESSION_SECONDS = 2 * 60 * 60; // 2 hours

function toDateKey(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return iso.slice(0, 10);
  }
}

function formatDateShort(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function formatDateLong(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function mean(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function formatHms(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function saneElapsedSeconds(row: StatsGameGraphPoint): number {
  const elapsed = row.elapsedSeconds;
  if (elapsed == null || !Number.isFinite(elapsed) || elapsed <= 0) return 0;

  // Time mode has a known target duration, so clamp near that target.
  if (row.gameMode === "time" && row.targetTimeSeconds != null && row.targetTimeSeconds > 0) {
    return Math.min(elapsed, row.targetTimeSeconds + 10);
  }

  // Words/quote sessions should not run for hours in normal play.
  return Math.min(elapsed, MAX_NON_TIME_SESSION_SECONDS);
}

function buildDailyRows(games: StatsGameGraphPoint[]): DailyRow[] {
  const byDay = new Map<string, StatsGameGraphPoint[]>();
  for (const game of games) {
    if (!game.endedAt) continue;
    const key = toDateKey(game.endedAt);
    const arr = byDay.get(key) ?? [];
    arr.push(game);
    byDay.set(key, arr);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, rows]) => {
      const totalSeconds = rows.reduce((sum, r) => {
        return sum + saneElapsedSeconds(r);
      }, 0);
      const wpmVals = rows.map((r) => r.wpm).filter((v): v is number => v != null && Number.isFinite(v));
      const highestWpm = wpmVals.length ? Math.max(...wpmVals) : null;

      return {
        dateKey,
        minutes: totalSeconds / 60,
        testsCompleted: rows.length,
        highestWpm,
        avgWpm: mean(rows.map((r) => r.wpm)),
        avgAccuracy: mean(rows.map((r) => r.accuracy)),
        avgConsistency: mean(rows.map((r) => r.consistency)),
        totalSeconds,
      };
    });
}

function DailyTypingTooltip(props: TooltipProps<number, string>) {
  const { active, payload } = props;
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as DailyRow | undefined;
  if (!row) return null;

  return (
    <div className="grid min-w-44 gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium text-foreground">{formatDateLong(row.dateKey)}</div>
      <div className="font-mono text-muted-foreground">Time Typing: {formatHms(row.totalSeconds)}</div>
      <div className="font-mono text-muted-foreground">Tests Completed: {row.testsCompleted}</div>
      <div className="font-mono text-muted-foreground">
        Highest WPM: {row.highestWpm != null ? row.highestWpm.toFixed(2) : "—"}
      </div>
      <div className="font-mono text-muted-foreground">
        Average WPM: {row.avgWpm != null ? row.avgWpm.toFixed(2) : "—"}
      </div>
      <div className="font-mono text-muted-foreground">
        Average Accuracy: {row.avgAccuracy != null ? `${row.avgAccuracy.toFixed(2)}%` : "—"}
      </div>
      <div className="font-mono text-muted-foreground">
        Average Consistency: {row.avgConsistency != null ? `${row.avgConsistency.toFixed(2)}%` : "—"}
      </div>
    </div>
  );
}

type Props = {
  games: StatsGameGraphPoint[];
};

export function StatsDailyTypingComboGraph({ games }: Props) {
  const data = React.useMemo(() => buildDailyRows(games), [games]);

  const minutesMax = React.useMemo(() => {
    const vals = data.map((d) => d.minutes).filter((v) => Number.isFinite(v) && v >= 0);
    if (!vals.length) return 1;
    return Math.max(1, Math.ceil(Math.max(...vals)));
  }, [data]);

  const wpmMax = React.useMemo(() => {
    const vals = data.map((d) => d.avgWpm).filter((v): v is number => v != null && Number.isFinite(v));
    if (!vals.length) return 10;
    return Math.max(10, Math.ceil(Math.max(...vals) / 10) * 10);
  }, [data]);

  return (
    <Card className="py-4 sm:py-0">
      <CardHeader className="border-b px-6 pb-4 pt-4">
        <CardTitle>Daily time typing and speed</CardTitle>
        <CardDescription>Bars show time typing per day, line shows average WPM per day.</CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        {data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No daily data for these filters.</p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
            <ComposedChart data={data} margin={{ left: 12, right: 12, top: 16, bottom: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="dateKey"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={20}
                interval="preserveStartEnd"
                tickFormatter={(value) => formatDateShort(String(value))}
              />
              <YAxis
                yAxisId="time"
                orientation="left"
                domain={[0, minutesMax]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={56}
                allowDecimals={false}
                tickFormatter={(v) => `${Math.round(Number(v))}`}
                label={{
                  value: "Time typing (minutes)",
                  angle: -90,
                  position: "insideLeft",
                  offset: -2,
                  style: {
                    textAnchor: "middle",
                    fill: "var(--muted-foreground)",
                    fontSize: 12,
                  },
                }}
              />
              <YAxis
                yAxisId="wpm"
                orientation="right"
                domain={[0, wpmMax]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={52}
                allowDecimals={false}
                label={{
                  value: "Average WPM",
                  angle: 90,
                  position: "insideRight",
                  offset: 0,
                  style: {
                    textAnchor: "middle",
                    fill: "var(--muted-foreground)",
                    fontSize: 12,
                  },
                }}
              />
              <Tooltip content={DailyTypingTooltip} cursor={{ fill: "var(--muted)", opacity: 0.12 }} />
              <Bar yAxisId="time" dataKey="minutes" fill="var(--color-minutes)" radius={[4, 4, 0, 0]} maxBarSize={48} />
              <Line
                yAxisId="wpm"
                dataKey="avgWpm"
                type="monotone"
                stroke="var(--color-avgWpm)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--color-avgWpm)" }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

