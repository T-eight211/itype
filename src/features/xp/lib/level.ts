export function levelForTotalXp(totalXp: number): number {
  const xp = Math.max(0, Math.floor(totalXp));
  if (xp === 0) return 0;
  const discriminant = 392 * xp + 22801;
  const level = Math.floor((Math.sqrt(discriminant) - 53) / 98);
  return Math.max(0, level);
}

export function totalXpForLevel(level: number): number {
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
