"use server";
// Server action used by the client leaderboard table to refresh the signed-in
// user's rank card when the selected board changes.

import {
  getViewerLeaderboardSnapshot,
  type LeaderboardBoard,
} from "@/features/leaderboard/server/get-leaderboards";

export async function fetchViewerLeaderboardSnapshot(
  board: LeaderboardBoard,
  userId: string
) {
  // Returns null when the user has no qualifying score for the selected board.
  return getViewerLeaderboardSnapshot(board, userId);
}
