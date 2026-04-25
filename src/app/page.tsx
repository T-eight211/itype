import { LandingPage } from "@/components/landing-page";
import { getLeaderboardTopRows } from "@/features/leaderboard/server/get-leaderboards";

export default async function Home() {
  const leaderboardRows = await getLeaderboardTopRows("all_time_15s", 20);
  return <LandingPage leaderboardRows={leaderboardRows} />;
}
