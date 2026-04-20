import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StatsLeaderboardCardProps = {
  rank: number | null;
  topPercent: number | null;
};

function formatOrdinal(value: number) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const mod10 = value % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

function formatTopPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

export function StatsLeaderboardCard({ rank, topPercent }: StatsLeaderboardCardProps) {
  return (
    <Card className="w-full rounded-[28px] border-border bg-background/40 shadow-lg backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-semibold tracking-tight text-foreground">
          All-time leaderboard
        </CardTitle>
        <p className="text-sm text-muted-foreground">15 seconds</p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/50 bg-muted/20 px-5 py-6">
          <p className="text-sm text-muted-foreground">My rank</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            {rank == null ? "--" : formatOrdinal(rank)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/50 bg-muted/20 px-5 py-6">
          <p className="text-sm text-muted-foreground">Top percentage</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            {topPercent == null ? "--" : formatTopPercent(topPercent)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
