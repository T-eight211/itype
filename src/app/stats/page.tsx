import type { Metadata } from "next";
import { getViewerLeaderboardSnapshot } from "@/features/leaderboard/server/get-leaderboards";
import { auth } from "@clerk/nextjs/server";
import { StatsLeaderboardCard } from "@/features/stats/components/stats-leaderboard-card";
import { StatsProfileCard } from "@/features/stats/components/stats-profile-card";
import { StatsRecentGamesCard } from "@/features/stats/components/stats-recent-games-card";
import CalendarHeatmap from "@/features/stats/components/calendar-heatmap";
import { StatsResultsGraph } from "@/features/stats/components/stats-results-graph";
import { DEFAULT_STATS_GRAPH_FILTERS } from "@/features/stats/lib/stats-results-graph-filters";
import { getDailyActivity } from "@/features/stats/server/get-daily-activity";
import { getRecentGamesStats } from "@/features/stats/server/get-recent-games-stats";
import { getStatsResultsGraphData } from "@/features/stats/server/get-stats-results-graph-data";
import { getStatsProfile } from "@/features/stats/server/get-stats-profile";

export const metadata: Metadata = {
  title: "Stats | IType",
  description: "Your typing profile and activity stats.",
};

export default async function StatsPage() {
  const { userId } = await auth();
  const [profile, leaderboard, recentGames, dailyActivity, statsGraphGames] = await Promise.all([
    getStatsProfile(),
    userId ? getViewerLeaderboardSnapshot("all_time_15s", userId) : Promise.resolve(null),
    userId ? getRecentGamesStats(userId) : Promise.resolve({ time: [], words: [] }),
    userId ? getDailyActivity(userId) : Promise.resolve([]),
    userId ? getStatsResultsGraphData(userId, DEFAULT_STATS_GRAPH_FILTERS) : Promise.resolve([]),
  ]);

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <StatsProfileCard profile={profile} />
        <StatsLeaderboardCard
          rank={leaderboard?.rank ?? null}
          topPercent={leaderboard?.topPercent ?? null}
        />
        
        <StatsRecentGamesCard stats={recentGames} />
        <CalendarHeatmap data={dailyActivity} />
        <StatsResultsGraph userId={userId} initialGames={statsGraphGames} />
      </div>
    </main>
  );
}
