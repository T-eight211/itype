import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { ServerManagementTable } from "@/features/leaderboard/components/server-management-table";
import {
  getLeaderboardPage,
  getViewerLeaderboardSnapshot,
} from "@/features/leaderboard/server/get-leaderboards";

export const metadata: Metadata = {
  title: "Leaderboard | IType",
  description: "Typing leaderboard",
};

export default async function LeaderboardPage() {
  const { userId } = await auth();
  const initial = await getLeaderboardPage("all_time_60s", 1);
  const initialViewer =
    userId != null ? await getViewerLeaderboardSnapshot("all_time_60s", userId) : null;

  return (
    <div className="flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      <ServerManagementTable
        title="Leaderboard"
        initialBoard="all_time_60s"
        initialRows={initial.rows}
        initialTotal={initial.total}
        initialPage={initial.page}
        viewerUserId={userId ?? ""}
        initialViewer={initialViewer}
      />
    </div>
  );
}
