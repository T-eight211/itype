export function levelForTotalXp(totalXp: number): number {
  // Convert total XP into a level using the inverse of totalXpForLevel().
  // Negative or decimal XP is normalised before the formula runs.
  const xp = Math.max(0, Math.floor(totalXp));
  if (xp === 0) return 0;
  const discriminant = 392 * xp + 22801;
  const level = Math.floor((Math.sqrt(discriminant) - 53) / 98);
  return Math.max(0, level);
}

export function totalXpForLevel(level: number): number {
  // Calculates the total XP required to reach a level. This is the level curve
  // used throughout the app.
  const l = Math.max(0, Math.floor(level));
  return Math.max(0, Math.round((49 * l * l + 53 * l - 102) / 2));
}

export type LevelProgress = {
  level: number;
  xpInto: number;
  xpNeeded: number;
  progressRatio: number;
};

export function xpProgressToNextLevel(totalXp: number): LevelProgress {
  // Build progress data for the UI: current level, XP earned inside that level,
  // XP needed for the next level, and a 0-1 progress ratio.
  const xp = Math.max(0, Math.floor(totalXp));
  const level = levelForTotalXp(xp);
  const currentThreshold = totalXpForLevel(level);
  const nextThreshold = totalXpForLevel(level + 1);
  const xpNeeded = Math.max(1, nextThreshold - currentThreshold);
  const xpInto = Math.max(0, xp - currentThreshold);
  return {
    level,
    xpInto,
    xpNeeded,
    progressRatio: Math.min(1, xpInto / xpNeeded),
  };
}
