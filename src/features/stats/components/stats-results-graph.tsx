"use client";

import * as React from "react";
import {
  CartesianGrid,
  ComposedChart,
  Customized,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import { Clock, Quote, Type } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import {
  DEFAULT_STATS_GRAPH_FILTERS,
  STATS_GRAPH_QUOTE_LENGTHS,
  STATS_GRAPH_TIME_PRESETS,
  STATS_GRAPH_WORD_PRESETS,
  type StatsGraphFilters,
} from "@/features/stats/lib/stats-results-graph-filters";
import { loadStatsResultsGraphData } from "@/features/stats/actions/load-stats-results-graph-data";
import { StatsDailyTypingComboGraph } from "@/features/stats/components/stats-daily-typing-combo-graph";
import { StatsFilteredSummaryCards } from "@/features/stats/components/stats-filtered-summary-cards";
import { StatsFilteredGamesTable } from "@/features/stats/components/stats-filtered-games-table";
import { StatsWpmTestHistogram } from "@/features/stats/components/number-of-test-histograms";
import type { StatsGameGraphPoint } from "@/features/stats/server/get-stats-results-graph-data";

const chartConfig = {
  // shadcn ChartContainer reads these labels and CSS colours for chart series.
  wpm: { label: "Speed", color: "var(--chart-1)" },
  accuracy: { label: "Accuracy", color: "var(--chart-2)" },
  avg10Wpm: { label: "Avg of 10", color: "var(--chart-3)" },
  avg10Acc: { label: "Avg of 10", color: "var(--chart-4)" },
  avg100Wpm: { label: "Avg of 100", color: "var(--chart-5)" },
  avg100Acc: { label: "Avg of 100", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

type ChartRow = {
  // ChartRow is derived from a saved game and adds rolling average fields used
  // only by this chart.
  idx: number;
  wpm: number | null;
  rawWpm: number | null;
  accuracy: number | null;
  avg10Wpm: number | null;
  avg10Accuracy: number | null;
  avg100Wpm: number | null;
  avg100Accuracy: number | null;
  endedAt: string;
  gameMode: string | null;
  punctuation: boolean;
  numbers: boolean;
  targetTimeSeconds: number | null;
  targetWordCount: number | null;
  quoteLength: string | null;
};

function rollingMean(values: (number | null)[], windowSize: number): (number | null)[] {
  // Rolling mean calculates an average ending at each game. For a 10-game
  // window, game 12 averages games 3-12.
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - (windowSize - 1));
    const slice = values
      .slice(start, i + 1)
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (slice.length === 0) out.push(null);
    else out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}

const STATS_GRAPH_TOOLTIP_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** e.g. `07 Mar 2026 23:21` */
function formatStatsGraphTooltipDate(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const day = String(d.getDate()).padStart(2, "0");
    const mon = STATS_GRAPH_TOOLTIP_MONTHS[d.getMonth()]!;
    const y = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${day} ${mon} ${y} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

/** One-line preset for tooltips, e.g. `time 30`, `word 10`, `quote short`. */
function formatStatsGraphGameMode(row: ChartRow): string {
  if (row.gameMode === "time" && row.targetTimeSeconds != null) {
    return `time ${row.targetTimeSeconds}`;
  }
  if (row.gameMode === "words" && row.targetWordCount != null) {
    return `word ${row.targetWordCount}`;
  }
  if (row.gameMode === "quote") {
    return row.quoteLength ? `quote ${row.quoteLength}` : "quote";
  }
  return row.gameMode ?? "—";
}

function WpmDot(props: unknown) {
  // Custom Recharts scatter shape for WPM points.
  const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: ChartRow };
  if (cx == null || cy == null || !payload || payload.wpm == null || !Number.isFinite(payload.wpm)) {
    return <g />;
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill="var(--color-wpm)"
      stroke="var(--card)"
      strokeWidth={1}
    />
  );
}

function AccTriangle(props: unknown) {
  // Custom Recharts scatter shape for accuracy points.
  const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: ChartRow };
  if (cx == null || cy == null || !payload || payload.accuracy == null || !Number.isFinite(payload.accuracy)) {
    return <g />;
  }
  const s = 5;
  return (
    <path
      d={`M ${cx} ${cy - s} L ${cx + s} ${cy + s * 0.75} L ${cx - s} ${cy + s * 0.75} Z`}
      fill="var(--color-accuracy)"
      stroke="var(--card)"
      strokeWidth={1}
    />
  );
}

function StatsGraphTooltip(props: TooltipProps<number, string>) {
  // Tooltip receives the hovered chart payload from Recharts and formats the
  // saved game metrics into a compact popup.
  const { active, payload } = props;
  if (!active || !payload?.length) return null;

  const wpmEntry = payload.find((p) => p.dataKey === "wpm");
  const accEntry = payload.find((p) => p.dataKey === "accuracy");
  const row = (wpmEntry?.payload ?? accEntry?.payload ?? {}) as ChartRow;

  const acc = row.accuracy;
  const err = acc != null && Number.isFinite(acc) ? 100 - acc : null;

  if (!wpmEntry && !accEntry) return null;

  const wpmStr = row.wpm != null && Number.isFinite(row.wpm) ? row.wpm.toFixed(2) : "—";
  const rawStr = row.rawWpm != null && Number.isFinite(row.rawWpm) ? row.rawWpm.toFixed(2) : "—";
  const dateStr = row.endedAt ? formatStatsGraphTooltipDate(row.endedAt) : "—";

  return (
    <div className="grid min-w-40 gap-0 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="grid gap-1 font-mono text-muted-foreground">
        <div>
          wpm: <span className="text-foreground">{wpmStr}</span>
        </div>
        <div>
          raw: <span className="text-foreground">{rawStr}</span>
        </div>
        <div>
          mode: <span className="text-foreground">{formatStatsGraphGameMode(row)}</span>
        </div>
        <div>
          punctuation: <span className="text-foreground">{String(row.punctuation)}</span>
        </div>
        <div>
          date: <span className="text-foreground">{dateStr}</span>
        </div>
      </div>
      <div className="my-2 h-px w-full bg-border/60" aria-hidden />
      <div className="grid gap-1 font-mono text-muted-foreground">
        <div>
          error rate: <span className="text-foreground">{err != null ? `${err.toFixed(2)}%` : "—"}</span>
        </div>
        <div>
          acc: <span className="text-foreground">{acc != null ? `${acc.toFixed(2)}%` : "—"}</span>
        </div>
      </div>
    </div>
  );
}

type AxisScaleState = {
  xAxisMap?: Record<number, { scale?: (v: number) => number }>;
  yAxisMap?: Record<string, { scale?: (v: number) => number }>;
};

function buildPolylinePoints(
  rows: ChartRow[],
  valueKey: "avg10Wpm" | "avg100Wpm" | "avg10Accuracy" | "avg100Accuracy",
  xScale: (v: number) => number,
  yScale: (v: number) => number
): string | null {
  // Convert rolling average values into SVG polyline coordinates. Recharts gives
  // scale functions that translate data values into pixel positions.
  const pts: string[] = [];
  for (const row of rows) {
    const v = row[valueKey];
    if (v == null || !Number.isFinite(v)) continue;
    const x = xScale(row.idx);
    const y = yScale(v);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    pts.push(`${x},${y}`);
  }
  return pts.length >= 2 ? pts.join(" ") : null;
}

function firstXAxis(xAxisMap: AxisScaleState["xAxisMap"]) {
  // Recharts stores axis scales in a map. This helper returns the first x-axis
  // scale so custom polylines can align with the chart.
  if (!xAxisMap) return undefined;
  return xAxisMap[0] ?? Object.values(xAxisMap)[0];
}


function MovingAveragePolylines({
  chartProps,
  chartRows,
  showAvg10Wpm,
  showAvg10Accuracy,
  showAvg100Wpm,
  showAvg100Accuracy,
}: {
  chartProps: AxisScaleState;
  chartRows: ChartRow[];
  showAvg10Wpm: boolean;
  showAvg10Accuracy: boolean;
  showAvg100Wpm: boolean;
  showAvg100Accuracy: boolean;
}) {
  // This component draws moving averages manually as SVG polylines on top of the
  // Recharts scatter plot.
  const yMap = chartProps.yAxisMap;
  const xAxis = firstXAxis(chartProps.xAxisMap);
  const yWpm = yMap?.wpm;
  const yAcc = yMap?.acc;
  const xScale = xAxis?.scale;
  const wpmScale = yWpm?.scale;
  const accScale = yAcc?.scale;
  if (!xScale || !wpmScale || !accScale) return null;

  const p10w = showAvg10Wpm ? buildPolylinePoints(chartRows, "avg10Wpm", xScale, wpmScale) : null;
  const p10a = showAvg10Accuracy ? buildPolylinePoints(chartRows, "avg10Accuracy", xScale, accScale) : null;
  const p100w = showAvg100Wpm ? buildPolylinePoints(chartRows, "avg100Wpm", xScale, wpmScale) : null;
  const p100a = showAvg100Accuracy
    ? buildPolylinePoints(chartRows, "avg100Accuracy", xScale, accScale)
    : null;

  return (
    <g className="recharts-moving-average-overlay" style={{ pointerEvents: "none" }}>
      {p10w ? (
        <polyline
          fill="none"
          stroke="var(--color-avg10Wpm)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={p10w}
        />
      ) : null}
      {p10a ? (
        <polyline
          fill="none"
          stroke="var(--color-avg10Acc)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={p10a}
        />
      ) : null}
      {p100w ? (
        <polyline
          fill="none"
          stroke="var(--color-avg100Wpm)"
          strokeWidth={2}
          strokeDasharray="3 3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={p100w}
        />
      ) : null}
      {p100a ? (
        <polyline
          fill="none"
          stroke="var(--color-avg100Acc)"
          strokeWidth={2}
          strokeDasharray="10 4"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={p100a}
        />
      ) : null}
    </g>
  );
}

export function StatsResultsGraph({
  userId,
  initialGames,
}: {
  userId: string | null;
  initialGames: StatsGameGraphPoint[];
}) {
  // React state stores current filters and chart toggles. Updating any setter
  // causes this client component to re-render.
  const [filters, setFilters] = React.useState<StatsGraphFilters>(DEFAULT_STATS_GRAPH_FILTERS);
  const [games, setGames] = React.useState<StatsGameGraphPoint[]>(initialGames);
  const [showWpmPoints, setShowWpmPoints] = React.useState(true);
  const [showAccuracyPoints, setShowAccuracyPoints] = React.useState(true);
  const [showAvg10, setShowAvg10] = React.useState(true);
  const [showAvg100, setShowAvg100] = React.useState(true);
  // useTransition marks filter refetches as non-urgent so the UI stays
  // responsive while the server action returns.
  const [pending, startTransition] = React.useTransition();
  // Refs store mutable flags without triggering re-renders.
  const hydratedRef = React.useRef(false);
  const initialHadRowsRef = React.useRef(initialGames.length > 0);

  React.useEffect(() => {
    // Keep local chart state in sync if the server-provided initial games change.
    setGames(initialGames);
  }, [initialGames]);

  React.useEffect(() => {
    // When filters change, call the server action to fetch matching games.
    if (!userId) return;
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      if (!initialHadRowsRef.current) {
        startTransition(() => {
          void loadStatsResultsGraphData(filters).then(setGames);
        });
      }
      return;
    }
    startTransition(() => {
      void loadStatsResultsGraphData(filters).then(setGames);
    });
  }, [filters, userId]);

  const chartRows = React.useMemo((): ChartRow[] => {
    // Build arrays for WPM and accuracy, then calculate rolling averages for
    // each point on the chart.
    const wpmSeries = games.map((g) => g.wpm);
    const accSeries = games.map((g) => g.accuracy);
    const avg10Wpm = rollingMean(wpmSeries, 10);
    const avg10Acc = rollingMean(accSeries, 10);
    const avg100Wpm = rollingMean(wpmSeries, 100);
    const avg100Acc = rollingMean(accSeries, 100);

    return games.map((g, i) => ({
      idx: i + 1,
      wpm: g.wpm,
      rawWpm: g.rawWpm,
      accuracy: g.accuracy,
      avg10Wpm: avg10Wpm[i] ?? null,
      avg10Accuracy: avg10Acc[i] ?? null,
      avg100Wpm: avg100Wpm[i] ?? null,
      avg100Accuracy: avg100Acc[i] ?? null,
      endedAt: g.endedAt,
      gameMode: g.gameMode,
      punctuation: g.punctuation,
      numbers: g.numbers,
      targetTimeSeconds: g.targetTimeSeconds,
      targetWordCount: g.targetWordCount,
      quoteLength: g.quoteLength,
    }));
  }, [games]);

  // Moving average lines are only shown when both the average toggle and the
  // corresponding metric toggle are enabled.
  const showAvg10Wpm = showAvg10 && showWpmPoints;
  const showAvg10Accuracy = showAvg10 && showAccuracyPoints;
  const showAvg100Wpm = showAvg100 && showWpmPoints;
  const showAvg100Accuracy = showAvg100 && showAccuracyPoints;

  const { yWpmMax, yAccMin } = React.useMemo(() => {
    // Calculate chart axis bounds from the series currently visible.
    const wpmVals: number[] = [];
    const accVals: number[] = [];
    for (const r of chartRows) {
      if (showWpmPoints && r.wpm != null && Number.isFinite(r.wpm)) wpmVals.push(r.wpm);
      if (showAvg10Wpm && r.avg10Wpm != null && Number.isFinite(r.avg10Wpm)) wpmVals.push(r.avg10Wpm);
      if (showAvg100Wpm && r.avg100Wpm != null && Number.isFinite(r.avg100Wpm))
        wpmVals.push(r.avg100Wpm);
      if (showAccuracyPoints && r.accuracy != null && Number.isFinite(r.accuracy)) accVals.push(r.accuracy);
      if (showAvg10Accuracy && r.avg10Accuracy != null && Number.isFinite(r.avg10Accuracy))
        accVals.push(r.avg10Accuracy);
      if (showAvg100Accuracy && r.avg100Accuracy != null && Number.isFinite(r.avg100Accuracy))
        accVals.push(r.avg100Accuracy);
    }
    const wpmMax = wpmVals.length ? Math.max(...wpmVals) : 0;
    const accMin = accVals.length ? Math.min(...accVals) : 0;
    let accFloor = Math.floor(accMin / 10) * 10;
    if (!accVals.length) accFloor = 0;
    else if (accFloor >= 100) accFloor = 90;
    return {
      yWpmMax: Math.max(10, Math.ceil(wpmMax / 10) * 10),
      yAccMin: Math.max(0, accFloor),
    };
  }, [
    chartRows,
    showWpmPoints,
    showAccuracyPoints,
    showAvg10Wpm,
    showAvg10Accuracy,
    showAvg100Wpm,
    showAvg100Accuracy,
  ]);

  const wpmAxisTicks = React.useMemo(() => {
    // Build WPM tick marks in steps of 10.
    const ticks: number[] = [];
    for (let v = 0; v <= yWpmMax; v += 10) ticks.push(v);
    return ticks;
  }, [yWpmMax]);

  const accAxisTicks = React.useMemo(() => {
    // Build accuracy tick marks in steps of 10.
    const ticks: number[] = [];
    for (let v = yAccMin; v <= 100; v += 10) ticks.push(v);
    return ticks;
  }, [yAccMin]);

  if (!userId) {
    // Guest state: there is no saved typing history to chart.
    return (
      <Card className="py-4 sm:py-0">
        <CardHeader>
          <CardTitle>Results over time</CardTitle>
          <CardDescription>Sign in to see your typing history on this chart.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
    <Card className="py-4 sm:py-0">
      <CardHeader className="border-b px-6 pb-4 pt-4">
        <CardTitle>Filters</CardTitle>
        <CardDescription>These filters apply to all stats charts below.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-6 py-4">
        {/* Filter controls update React state. The effect above then refetches filtered games. */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Range</Label>
          <ToggleGroup
            type="single"
            spacing={0}
            variant="outline"
            className="flex w-full"
            value={filters.range}
            onValueChange={(v) => v && setFilters((f) => ({ ...f, range: v as StatsGraphFilters["range"] }))}
          >
            <ToggleGroupItem value="day" className="min-w-0 flex-1 text-xs">
              day
            </ToggleGroupItem>
            <ToggleGroupItem value="week" className="min-w-0 flex-1 text-xs">
              week
            </ToggleGroupItem>
            <ToggleGroupItem value="month" className="min-w-0 flex-1 text-xs">
              month
            </ToggleGroupItem>
            <ToggleGroupItem value="3months" className="min-w-0 flex-1 text-xs">
              3 months
            </ToggleGroupItem>
            <ToggleGroupItem value="all" className="min-w-0 flex-1 text-xs">
              all
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="min-w-0 space-y-2">
            <Label className="text-xs text-muted-foreground">Punctuation</Label>
            <ToggleGroup
              type="single"
              spacing={0}
              variant="outline"
              className="flex w-full"
              value={filters.punctuation}
              onValueChange={(v) => v && setFilters((f) => ({ ...f, punctuation: v as StatsGraphFilters["punctuation"] }))}
            >
              <ToggleGroupItem value="off" className="min-w-0 flex-1 text-xs">
                off
              </ToggleGroupItem>
              <ToggleGroupItem value="on" className="min-w-0 flex-1 text-xs">
                on
              </ToggleGroupItem>
              <ToggleGroupItem value="both" className="min-w-0 flex-1 text-xs">
                both
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="min-w-0 space-y-2">
            <Label className="text-xs text-muted-foreground">Numbers</Label>
            <ToggleGroup
              type="single"
              spacing={0}
              variant="outline"
              className="flex w-full"
              value={filters.numbers}
              onValueChange={(v) => v && setFilters((f) => ({ ...f, numbers: v as StatsGraphFilters["numbers"] }))}
            >
              <ToggleGroupItem value="off" className="min-w-0 flex-1 text-xs">
                off
              </ToggleGroupItem>
              <ToggleGroupItem value="on" className="min-w-0 flex-1 text-xs">
                on
              </ToggleGroupItem>
              <ToggleGroupItem value="both" className="min-w-0 flex-1 text-xs">
                both
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Modes (none selected = all modes)</Label>
          <ToggleGroup
            type="multiple"
            spacing={0}
            variant="outline"
            className="flex w-full"
            value={filters.modes}
            onValueChange={(v) => setFilters((f) => ({ ...f, modes: v as StatsGraphFilters["modes"] }))}
          >
            <ToggleGroupItem value="time" className="min-w-0 flex-1 gap-1 text-xs" aria-label="Time mode">
              <Clock className="size-3.5 shrink-0" />
              time
            </ToggleGroupItem>
            <ToggleGroupItem value="words" className="min-w-0 flex-1 gap-1 text-xs" aria-label="Words mode">
              <Type className="size-3.5 shrink-0" />
              words
            </ToggleGroupItem>
            <ToggleGroupItem value="quote" className="min-w-0 flex-1 gap-1 text-xs" aria-label="Quote mode">
              <Quote className="size-3.5 shrink-0" />
              quote
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <Label className={cn("text-xs", !filters.modes.includes("time") && "text-muted-foreground/60")}>
              Time (seconds)
            </Label>
            <ToggleGroup
              type="multiple"
              spacing={0}
              variant="outline"
              className="flex w-full flex-wrap justify-start"
              value={filters.timeSeconds.map(String)}
              onValueChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  timeSeconds:
                    v.length > 0
                      ? v.map(Number).filter((n) => (STATS_GRAPH_TIME_PRESETS as readonly number[]).includes(n))
                      : [...STATS_GRAPH_TIME_PRESETS],
                }))
              }
            >
              {STATS_GRAPH_TIME_PRESETS.map((s) => (
                <ToggleGroupItem key={s} value={String(s)} className="text-xs" disabled={!filters.modes.includes("time")}>
                  {s}s
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <Label className={cn("text-xs", !filters.modes.includes("words") && "text-muted-foreground/60")}>
              Word count
            </Label>
            <ToggleGroup
              type="multiple"
              spacing={0}
              variant="outline"
              className="flex w-full flex-wrap justify-start"
              value={filters.wordCounts.map(String)}
              onValueChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  wordCounts:
                    v.length > 0
                      ? v.map(Number).filter((n) => (STATS_GRAPH_WORD_PRESETS as readonly number[]).includes(n))
                      : [...STATS_GRAPH_WORD_PRESETS],
                }))
              }
            >
              {STATS_GRAPH_WORD_PRESETS.map((c) => (
                <ToggleGroupItem key={c} value={String(c)} className="text-xs" disabled={!filters.modes.includes("words")}>
                  {c}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <Label className={cn("text-xs", !filters.modes.includes("quote") && "text-muted-foreground/60")}>
              Quote length
            </Label>
            <ToggleGroup
              type="multiple"
              spacing={0}
              variant="outline"
              className="flex w-full flex-wrap justify-start"
              value={filters.quoteLengths}
              onValueChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  quoteLengths: v.length > 0 ? [...v] : [...STATS_GRAPH_QUOTE_LENGTHS],
                }))
              }
            >
              {STATS_GRAPH_QUOTE_LENGTHS.map((len) => (
                <ToggleGroupItem key={len} value={len} className="text-xs capitalize" disabled={!filters.modes.includes("quote")}>
                  {len}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
        {pending ? <p className="text-xs text-muted-foreground">Updating chart…</p> : null}
      </CardContent>
    </Card>

    <Card className="py-4 sm:py-0">
      <CardHeader className="flex flex-col items-stretch border-b p-0! sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pb-3 pt-4 sm:py-0">
          <CardTitle>Results over time</CardTitle>
          <CardDescription>WPM and accuracy per completed game, with moving averages.</CardDescription>
        </div>
        <div className="flex w-full min-w-0 sm:w-auto sm:shrink-0 sm:flex-nowrap">
          <button
            type="button"
            data-active={showWpmPoints}
            className={cn(
              "flex min-w-0 flex-1 flex-col justify-center border-t px-4 py-3 text-left sm:min-w-20 sm:border-t-0 sm:border-l sm:px-8 sm:py-6",
              "data-[active=true]:bg-muted/50"
            )}
            onClick={() => setShowWpmPoints((p) => !p)}
          >
            <span className="text-sm font-semibold sm:text-base">{chartConfig.wpm.label}</span>
          </button>
          <button
            type="button"
            data-active={showAccuracyPoints}
            className={cn(
              "flex min-w-0 flex-1 flex-col justify-center border-t px-4 py-3 text-left data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-6"
            )}
            onClick={() => setShowAccuracyPoints((p) => !p)}
          >
            <span className="text-sm font-semibold sm:text-base">{chartConfig.accuracy.label}</span>
          </button>
          <button
            type="button"
            data-active={showAvg10}
            className={cn(
              "flex min-w-0 flex-1 flex-col justify-center border-t px-4 py-3 text-left data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-6"
            )}
            onClick={() => setShowAvg10((p) => !p)}
          >
            <span className="text-sm font-semibold sm:text-base">{chartConfig.avg10Wpm.label}</span>
          </button>
          <button
            type="button"
            data-active={showAvg100}
            className={cn(
              "flex min-w-0 flex-1 flex-col justify-center border-t px-4 py-3 text-left data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-6"
            )}
            onClick={() => setShowAvg100((p) => !p)}
          >
            <span className="text-sm font-semibold sm:text-base">{chartConfig.avg100Wpm.label}</span>
          </button>
        </div>
      </CardHeader>

      <CardContent className="px-2 sm:p-6">
        {chartRows.length === 0 ? (
          // Empty state when the current filters match no saved games.
          <p className="py-8 text-center text-sm text-muted-foreground">No games match these filters.</p>
        ) : (
          // Recharts renders WPM and accuracy as scatter points with optional
          // moving-average overlays.
          <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
            <ComposedChart data={chartRows} margin={{ left: 14, right: 26, top: 18, bottom: 14 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                type="number"
                dataKey="idx"
                domain={["dataMin", "dataMax"]}
                tick={false}
                axisLine={false}
                tickLine={false}
                height={8}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="acc"
                orientation="left"
                domain={[yAccMin, 100]}
                reversed
                ticks={accAxisTicks}
                interval={0}
                tickLine={false}
                axisLine={false}
                tickMargin={14}
                width={52}
                allowDecimals={false}
                label={{
                  value: "Accuracy",
                  angle: -90,
                  position: "insideLeft",
                  offset: 2,
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
                domain={[0, yWpmMax]}
                ticks={wpmAxisTicks}
                interval={0}
                tickLine={false}
                axisLine={false}
                tickMargin={14}
                width={58}
                allowDecimals={false}
                label={{
                  value: "Word per Minute",
                  angle: 90,
                  position: "insideRight",
                  offset: 2,
                  style: {
                    textAnchor: "middle",
                    fill: "var(--muted-foreground)",
                    fontSize: 12,
                  },
                }}
              />
              <Tooltip content={StatsGraphTooltip} cursor={{ strokeDasharray: "4 4", opacity: 0.45 }} shared />
              {showWpmPoints && (
                <Scatter yAxisId="wpm" dataKey="wpm" name="WPM" fill="var(--color-wpm)" shape={WpmDot} isAnimationActive={false} />
              )}
              {showAccuracyPoints && (
                <Scatter
                  yAxisId="acc"
                  dataKey="accuracy"
                  name="Accuracy"
                  fill="var(--color-accuracy)"
                  shape={AccTriangle}
                  isAnimationActive={false}
                />
              )}
              {(showAvg10Wpm || showAvg10Accuracy || showAvg100Wpm || showAvg100Accuracy) && (
                <Customized
                  component={(props: unknown) => (
                    <MovingAveragePolylines
                      chartProps={props as AxisScaleState}
                      chartRows={chartRows}
                      showAvg10Wpm={showAvg10Wpm}
                      showAvg10Accuracy={showAvg10Accuracy}
                      showAvg100Wpm={showAvg100Wpm}
                      showAvg100Accuracy={showAvg100Accuracy}
                    />
                  )}
                />
              )}
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
    <StatsWpmTestHistogram games={games} />
    <StatsDailyTypingComboGraph games={games} />
    <StatsFilteredSummaryCards games={games} />
    <StatsFilteredGamesTable games={games} />
    </div>
  );
}
