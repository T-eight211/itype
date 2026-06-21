"use server";
// Server action used by the client leaderboard table. It runs on the backend and
// safely calls the Prisma leaderboard query helper.

import {
  getLeaderboardPage,
  type LeaderboardBoard,
} from "@/features/leaderboard/server/get-leaderboards";

export async function fetchLeaderboardPage(board: LeaderboardBoard, page: number) {
  // The client sends the selected board and page number, then receives rows,
  // total count and any daily metadata.
  return getLeaderboardPage(board, page);
}
