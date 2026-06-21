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
  // This page is a server component. It can call Clerk auth and server-side
  // leaderboard queries before sending the first render to the browser.
  const { userId } = await auth();
  // Load the default all-time 60s board on the server so the page is populated
  // immediately without waiting for a client-side fetch.
  const initial = await getLeaderboardPage("all_time_60s", 1);
  // If the visitor is signed in, also fetch their own placement for the default
  // board. Guests can still view the leaderboard but do not get a "you" card.
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
