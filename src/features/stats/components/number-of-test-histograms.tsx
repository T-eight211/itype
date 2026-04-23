"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
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

const WPM_BUCKET = 10;

const chartConfig = {
  tests: {
    label: "Tests",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export type WpmHistogramRow = {
  rangeLabel: string;
  tests: number;
};

function buildWpmHistogram(games: StatsGameGraphPoint[]): WpmHistogramRow[] {
  const wpmValues = games
    .map((g) => g.wpm)
    .filter((w): w is number => w != null && Number.isFinite(w) && w >= 0);
  if (wpmValues.length === 0) return [];

  const maxWpm = Math.max(...wpmValues);
  const maxBucket = Math.max(0, Math.floor(maxWpm / WPM_BUCKET));
  const counts = new Array<number>(maxBucket + 1).fill(0);
  for (const w of wpmValues) {
    counts[Math.floor(w / WPM_BUCKET)] += 1;
  }

  return counts.map((tests, i) => {
    const low = i * WPM_BUCKET;
    const high = low + WPM_BUCKET - 1;
    return {
      rangeLabel: `${low}-${high}`,
      tests,
    };
  });
}

function HistogramTooltip(props: TooltipProps<number, string>) {
  const { active, payload } = props;
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as WpmHistogramRow | undefined;
  if (!row) return null;
  return (
    <div className="grid min-w-36 gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium text-foreground">{row.rangeLabel}</div>
      <div className="font-mono text-muted-foreground">Tests: {row.tests}</div>
    </div>
  );
}

type StatsWpmTestHistogramProps = {
  games: StatsGameGraphPoint[];
};

export function StatsWpmTestHistogram({ games }: StatsWpmTestHistogramProps) {
  const chartData = React.useMemo(() => buildWpmHistogram(games), [games]);

  return (
    <Card className="py-4 sm:py-0">
      <CardHeader className="border-b px-6 pb-4 pt-4">
        <CardTitle>Tests by WPM</CardTitle>
        <CardDescription>
          Count of completed games in each WPM band (same filters as the chart above).
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        {chartData.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No WPM data for these filters.</p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
            <BarChart
              accessibilityLayer
              data={chartData}
              margin={{ left: 12, right: 12, top: 16, bottom: 8 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="rangeLabel"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                minTickGap={20}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, (max: number) => Math.max(max, 1)]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={50}
                allowDecimals={false}
                label={{
                  value: "Tests",
                  angle: -90,
                  position: "insideLeft",
                  offset: 4,
                  style: {
                    textAnchor: "middle",
                    fill: "var(--muted-foreground)",
                    fontSize: 12,
                  },
                }}
              />
              <Tooltip content={HistogramTooltip} cursor={{ fill: "var(--muted)", opacity: 0.15 }} />
              <Bar dataKey="tests" fill="var(--color-tests)" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
