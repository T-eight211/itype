"use server";

import {
  getViewerLeaderboardSnapshot,
  type LeaderboardBoard,
} from "@/features/leaderboard/server/get-leaderboards";

export async function fetchViewerLeaderboardSnapshot(
  board: LeaderboardBoard,
  userId: string
) {
  return getViewerLeaderboardSnapshot(board, userId);
}
