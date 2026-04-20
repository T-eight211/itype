"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { RecentGamesStats } from "@/features/stats/server/get-recent-games-stats";

type StatsRecentGamesCardProps = {
  stats: RecentGamesStats;
};

function formatWhole(value: number | null) {
  return value == null || Number.isNaN(value) ? "--" : String(Math.round(value));
}

function formatDate(value: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function PresetCell({
  label,
  wpm,
  rawWpm,
  accuracy,
  consistency,
  endedAt,
}: {
  label: string;
  wpm: number | null;
  rawWpm: number | null;
  accuracy: number | null;
  consistency: number | null;
  endedAt: string | null;
}) {
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="flex min-h-28 flex-col items-start justify-center rounded-2xl px-4 py-4 text-left transition-colors hover:bg-muted/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="mt-1 text-4xl font-light leading-none tracking-tight text-foreground">
            {formatWhole(wpm)}
          </span>
          <span className="mt-2 text-3xl font-light leading-none tracking-tight text-muted-foreground">
            {accuracy == null ? "--" : `${formatWhole(accuracy)}%`}
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72 rounded-2xl border-border/60 bg-background/95 p-4">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">Most recent result for this preset</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">WPM</p>
              <p className="mt-1 font-mono text-lg text-foreground">{formatWhole(wpm)}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Raw</p>
              <p className="mt-1 font-mono text-lg text-foreground">{formatWhole(rawWpm)}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Accuracy</p>
              <p className="mt-1 font-mono text-lg text-foreground">
                {accuracy == null ? "--" : `${formatWhole(accuracy)}%`}
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Consistency</p>
              <p className="mt-1 font-mono text-lg text-foreground">{formatWhole(consistency)}</p>
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Date</p>
            <p className="mt-1 text-foreground">{formatDate(endedAt)}</p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function PresetPanel({
  title,
  items,
  unit,
}: {
  title: string;
  items: RecentGamesStats["time"] | RecentGamesStats["words"];
  unit: "seconds" | "words";
}) {
  return (
    <div className="rounded-3xl border border-border/50 bg-muted/20 p-4">
      <p className="px-4 pb-1 text-sm font-medium text-muted-foreground">{title}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <PresetCell
            key={`${unit}-${item.preset}`}
            label={`${item.preset} ${unit}`}
            wpm={item.wpm}
            rawWpm={item.rawWpm}
            accuracy={item.accuracy}
            consistency={item.consistency}
            endedAt={item.endedAt}
          />
        ))}
      </div>
    </div>
  );
}

export function StatsRecentGamesCard({ stats }: StatsRecentGamesCardProps) {
  return (
    <Card className="w-full rounded-[28px] border-border bg-background/40 shadow-lg backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold tracking-tight text-foreground">
          Recent games
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <PresetPanel title="Time mode" items={stats.time} unit="seconds" />
        <PresetPanel title="Word mode" items={stats.words} unit="words" />
      </CardContent>
    </Card>
  );
}
