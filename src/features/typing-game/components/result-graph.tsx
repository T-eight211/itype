// This file was adapted from shadcn/ui line charts:
// https://ui.shadcn.com/charts/line#charts

"use client"

import * as React from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { smoothWithValueWindow } from "@/features/typing-game/utils/smooth-burst"

const chartConfig = {
  views: {
    label: "WPM",
  },
  wpm: {
    label: "wpm",
    color: "var(--chart-1)",
  },
  raw: {
    label: "raw",
    color: "var(--chart-2)",
  },
  burst: {
    label: "burst",
    color: "var(--chart-3)",
  },
  errors: {
    label: "errors",
    color: "var(--destructive)",
  },
} satisfies ChartConfig

interface ResultGraphProps {
  wpmHistory: number[]
  rawWpmHistory: number[]
  burstWpm: number[]
  wpm: number
  rawWpm: number
  wpmDisplay: string
  rawWpmDisplay: string
  accuracy: number
  accuracyDisplay: string
  correctKeystrokes: number
  incorrectKeystrokes: number
  incorrectHistory: number[]
  consistency: number | null
  elapsedSeconds: number
  mode: string
}

// Shows the final result chart after a completed game. This is a client
// component because the user can toggle raw WPM, burst WPM and errors.
export function ResultGraph({ wpmHistory, rawWpmHistory, burstWpm, wpm, rawWpm, wpmDisplay, rawWpmDisplay, accuracy, accuracyDisplay, correctKeystrokes, incorrectKeystrokes, incorrectHistory, consistency, elapsedSeconds, mode }: ResultGraphProps) {
  // Toggle state controls which lines are visible in the chart.
  const [showRaw, setShowRaw] = React.useState(true)
  const [showBurst, setShowBurst] = React.useState(true)
  const [showErrors, setShowErrors] = React.useState(true)

  // Burst WPM can jump sharply, so it is smoothed before rendering.
  const smoothedBurst = React.useMemo(() => {
    const valueWindow = Math.max(...burstWpm, 0) * 0.25;
    return smoothWithValueWindow(burstWpm, 1, valueWindow);
  }, [burstWpm])

  // Convert history arrays into Recharts data points. `useMemo` avoids rebuilding
  // the array unless the input history changes.
  const chartData = React.useMemo(() => {
    const partialSecond = elapsedSeconds % 1;
    const isPartial = mode !== "time" && partialSecond > 0;
    const dropLast = isPartial && partialSecond < 0.5;
    const count = dropLast ? wpmHistory.length - 1 : wpmHistory.length;

    const data: { second: number; wpm: number; raw: number; burst: number; errors: number }[] = [];
    for (let i = 0; i < count; i++) {
      const isLastAndPartial = isPartial && !dropLast && i === count - 1;
      data.push({
        second: isLastAndPartial
          ? parseFloat((Math.floor(elapsedSeconds) + partialSecond).toFixed(2))
          : i + 1,
        wpm: wpmHistory[i] ?? 0,
        raw: rawWpmHistory[i] ?? 0,
        burst: smoothedBurst[i] ?? 0,
        errors: incorrectHistory[i] ?? 0,
      });
    }
    return data;
  }, [wpmHistory, rawWpmHistory, smoothedBurst, incorrectHistory, elapsedSeconds, mode])

  // Dynamic y-axis max keeps the graph readable for both low and high WPM tests.
  const yMax = React.useMemo(() => {
    const values = [...wpmHistory]
    if (showRaw) values.push(...rawWpmHistory)
    if (showBurst) values.push(...smoothedBurst)
    const max = Math.max(0, ...values)
    return Math.ceil(max / 10) * 10
  }, [wpmHistory, rawWpmHistory, smoothedBurst, showRaw, showBurst])

  return (
    <Card className="py-4 sm:py-0">
      <CardHeader className="flex flex-col items-stretch border-b p-0! sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pb-3 sm:pb-0">
          <CardTitle>Performance</CardTitle>
          <CardDescription>Words per minute over time</CardDescription>
        </div>
        <div className="flex">
          <HoverCard openDelay={50} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div
                data-active={true}
                className="flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-6 cursor-default"
              >
                <span className="text-xs text-muted-foreground">{chartConfig.wpm.label}</span>
                <span className="text-lg leading-none font-bold sm:text-3xl">{Math.round(wpm)}</span>
              </div>
            </HoverCardTrigger>
            <HoverCardContent className="flex w-32 flex-col items-center">
              <span className="text-sm font-mono">{wpmDisplay} wpm</span>
            </HoverCardContent>
          </HoverCard>
          <HoverCard openDelay={50} closeDelay={100}>
            <HoverCardTrigger asChild>
              <button
                data-active={showRaw}
                className="flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-6"
                onClick={() => setShowRaw((prev) => !prev)}
              >
                <span className="text-xs text-muted-foreground">{chartConfig.raw.label}</span>
                <span className="text-lg leading-none font-bold sm:text-3xl">{Math.round(rawWpm)}</span>
              </button>
            </HoverCardTrigger>
            <HoverCardContent className="flex w-32 flex-col items-center">
              <span className="text-sm font-mono">{rawWpmDisplay} wpm</span>
            </HoverCardContent>
          </HoverCard>
          <button
            data-active={showBurst}
            className="flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-6"
            onClick={() => setShowBurst((prev) => !prev)}
          >
            <span className="text-xs text-muted-foreground">{chartConfig.burst.label}</span>
          </button>
          <button
            data-active={showErrors}
            className="flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-6"
            onClick={() => setShowErrors((prev) => !prev)}
          >
            <span className="text-xs text-muted-foreground">{chartConfig.errors.label}</span>
          </button>
          <HoverCard openDelay={50} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div
                data-active={true}
                className="flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-6 cursor-default"
              >
                <span className="text-xs text-muted-foreground">accuracy</span>
                <span className="text-lg leading-none font-bold sm:text-3xl">{Math.round(accuracy)}%</span>
              </div>
            </HoverCardTrigger>
            <HoverCardContent className="flex w-40 flex-col gap-1">
              <span className="text-sm font-mono">{accuracyDisplay}%</span>
              <span className="text-sm font-mono">{correctKeystrokes} correct</span>
              <span className="text-sm font-mono">{incorrectKeystrokes} incorrect</span>
            </HoverCardContent>
          </HoverCard>
          {consistency !== null && (
            <HoverCard openDelay={50} closeDelay={100}>
              <HoverCardTrigger asChild>
                <div
                  data-active={true}
                  className="flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-6 cursor-default"
                >
                  <span className="text-xs text-muted-foreground">consistency</span>
                  <span className="text-lg leading-none font-bold sm:text-3xl">{Math.round(consistency)}%</span>
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="flex w-32 flex-col items-center">
                <span className="text-sm font-mono">{consistency.toFixed(2)}%</span>
              </HoverCardContent>
            </HoverCard>
          )}
          <HoverCard openDelay={50} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div
                data-active={true}
                className="flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-6 cursor-default"
              >
                <span className="text-xs text-muted-foreground">time</span>
                <span className="text-lg leading-none font-bold sm:text-3xl">{Math.round(elapsedSeconds)}s</span>
              </div>
            </HoverCardTrigger>
            <HoverCardContent className="flex w-32 flex-col items-center">
              <span className="text-sm font-mono">{elapsedSeconds.toFixed(2)}s</span>
            </HoverCardContent>
          </HoverCard>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{ left: 12, right: 12, top: 10 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="second"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(v) => `${v}`}
            />
            <YAxis
              yAxisId="wpm"
              domain={[0, yMax]}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={55}
              label={{ value: "Words per Minute", angle: -90, position: "insideLeft", offset: -5, style: { textAnchor: "middle", fill: "var(--muted-foreground)", fontSize: 12 } }}
            />
            <YAxis
              yAxisId="errors"
              orientation="right"
              domain={[0, (max: number) => Math.max(max, 1)]}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={50}
              allowDecimals={false}
              label={{ value: "errors", angle: 90, position: "insideRight", offset: -5, style: { textAnchor: "middle", fill: "var(--muted-foreground)", fontSize: 12 } }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  className="w-[150px]"
                  labelFormatter={(_v, payload) => {
                    const second = Array.isArray(payload) ? (payload[0] as { payload: { second: number } })?.payload?.second : "";
                    return `${second}s`;
                  }}
                />
              }
            />
            <Line
              yAxisId="wpm"
              dataKey="wpm"
              type="monotone"
              stroke="var(--color-wpm)"
              strokeWidth={2}
              dot={false}
            />
            {showRaw && (
              <Line
                yAxisId="wpm"
                dataKey="raw"
                type="monotone"
                stroke="var(--color-raw)"
                strokeWidth={2}
                dot={false}
              />
            )}
            {showBurst && (
              <Line
                yAxisId="wpm"
                dataKey="burst"
                type="monotone"
                stroke="var(--color-burst)"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                isAnimationActive={false}
              />
            )}
            {showErrors && (
              <Line
                yAxisId="errors"
                dataKey="errors"
                type="monotone"
                stroke="var(--color-errors)"
                strokeWidth={0}
                dot={(props: Record<string, unknown>) => {
                  const { cx, cy, payload } = props as { cx: number; cy: number; payload: { errors: number } };
                  if (!payload.errors) return <g key={`err-${cx}`} />;
                  return (
                    <g key={`err-${cx}`}>
                      <line x1={cx - 4} y1={cy - 4} x2={cx + 4} y2={cy + 4} stroke="var(--destructive)" strokeWidth={2} />
                      <line x1={cx + 4} y1={cy - 4} x2={cx - 4} y2={cy + 4} stroke="var(--destructive)" strokeWidth={2} />
                    </g>
                  );
                }}
                activeDot={false}
                isAnimationActive={false}
                legendType="none"
              />
            )}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
