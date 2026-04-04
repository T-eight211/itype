"use server";

import {
  getLeaderboardPage,
  type LeaderboardBoard,
} from "@/features/leaderboard/server/get-leaderboards";

export async function fetchLeaderboardPage(board: LeaderboardBoard, page: number) {
  return getLeaderboardPage(board, page);
}
