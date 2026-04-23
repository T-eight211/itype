"use client";

import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StatsGameGraphPoint } from "@/features/stats/server/get-stats-results-graph-data";

const PAGE_SIZE = 25;

function formatNumber(value: number | null, suffix = ""): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}${suffix}`;
}

function formatMode(row: StatsGameGraphPoint): string {
  if (row.gameMode === "time" && row.targetTimeSeconds != null) return `time ${row.targetTimeSeconds}`;
  if (row.gameMode === "words" && row.targetWordCount != null) return `words ${row.targetWordCount}`;
  if (row.gameMode === "quote") return row.quoteLength ? `quote ${row.quoteLength}` : "quote";
  return row.gameMode ?? "—";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

type Props = {
  games: StatsGameGraphPoint[];
};

export function StatsFilteredGamesTable({ games }: Props) {
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);

  const rows = React.useMemo(
    () => [...games].sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime()),
    [games]
  );

  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [games]);

  const visibleRows = rows.slice(0, visibleCount);
  const hasMore = visibleCount < rows.length;

  return (
    <Card className="py-4 sm:py-0">
      <CardHeader className="border-b px-6 pb-4 pt-4">
        <CardTitle>Filtered games</CardTitle>
        <CardDescription>All games matching current filters.</CardDescription>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No games for these filters.</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>WPM</TableHead>
                  <TableHead>Raw</TableHead>
                  <TableHead>Accuracy</TableHead>
                  <TableHead>Consistency</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono">{formatNumber(row.wpm)}</TableCell>
                    <TableCell className="font-mono">{formatNumber(row.rawWpm)}</TableCell>
                    <TableCell className="font-mono">{formatNumber(row.accuracy, "%")}</TableCell>
                    <TableCell className="font-mono">{formatNumber(row.consistency, "%")}</TableCell>
                    <TableCell className="font-mono">{formatMode(row)}</TableCell>
                    <TableCell className="font-mono">{formatDate(row.endedAt)}</TableCell>
                    <TableCell className="font-mono">{formatTime(row.endedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {hasMore ? (
              <div className="mt-4 flex items-center justify-center">
                <Button variant="outline" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

