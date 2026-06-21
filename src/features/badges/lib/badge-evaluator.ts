import type { BadgeKey } from "./badges";
import { BADGE_THRESHOLDS } from "./badge-thresholds";

export type BadgeInputs = {
  // Values needed to decide which badges the user qualifies for after one
  // completed typing result.
  thisGame: { wpm: number; accuracy: number };
  averageAccuracy: number;
  currentStreakDays: number;
  level: number;
  totalTestsAfter: number;
  firstCompletedGameRank: number | null;
};

export type AwardableBadge = {
  // Candidate badge plus metadata explaining why it was awarded.
  key: BadgeKey;
  metadata: Record<string, number>;
};

export function evaluateEligibleBadges(inputs: BadgeInputs): AwardableBadge[] {
  // Pure function: it only checks values and returns candidates. It does not
  // read or write the database.
  const {
    thisGame,
    averageAccuracy,
    currentStreakDays,
    level,
    totalTestsAfter,
    firstCompletedGameRank,
  } = inputs;

  const awards: AwardableBadge[] = [];
  const wpm = thisGame.wpm;
  const accuracy = thisGame.accuracy;

  // Speed badges use this game's WPM. The same metadata is saved with each speed
  // badge so the database records the evidence.
  const speedMeta = { wpm, accuracy };
  if (wpm >= BADGE_THRESHOLDS.speed.fastFingersWpm)
    awards.push({ key: "fast_fingers", metadata: speedMeta });
  if (wpm >= BADGE_THRESHOLDS.speed.speedDemonWpm)
    awards.push({ key: "speed_demon", metadata: speedMeta });
  if (wpm >= BADGE_THRESHOLDS.speed.lightningTypistWpm)
    awards.push({ key: "lightning_typist", metadata: speedMeta });

  // Accuracy badges use average accuracy across the user's saved typing results.
  if (averageAccuracy >= BADGE_THRESHOLDS.accuracy.sharpShooterAverage) {
    awards.push({ key: "sharp_shooter", metadata: { averageAccuracy } });
  }
  if (averageAccuracy >= BADGE_THRESHOLDS.accuracy.perfectRunAverage) {
    awards.push({ key: "perfect_run", metadata: { averageAccuracy } });
  }

  // Streak badges use the current streak after this completed game.
  if (currentStreakDays >= BADGE_THRESHOLDS.streak.gettingStartedDays) {
    awards.push({
      key: "getting_started",
      metadata: { streakDays: currentStreakDays },
    });
  }
  if (currentStreakDays >= BADGE_THRESHOLDS.streak.consistentDays) {
    awards.push({
      key: "consistent",
      metadata: { streakDays: currentStreakDays },
    });
  }
  if (currentStreakDays >= BADGE_THRESHOLDS.streak.unstoppableDays) {
    awards.push({
      key: "unstoppable",
      metadata: { streakDays: currentStreakDays },
    });
  }

  // Level badges use the user's level after XP is awarded.
  if (level >= BADGE_THRESHOLDS.level.levelUp)
    awards.push({ key: "level_up", metadata: { level } });
  if (level >= BADGE_THRESHOLDS.level.proTypist)
    awards.push({ key: "pro_typist", metadata: { level } });
  if (level >= BADGE_THRESHOLDS.level.masterTypist)
    awards.push({ key: "master_typist", metadata: { level } });

  // Practice badges use total completed tests after this result has been saved.
  if (totalTestsAfter >= BADGE_THRESHOLDS.practice.firstSteps) {
    awards.push({
      key: "first_steps",
      metadata: { totalTests: totalTestsAfter },
    });
  }
  if (totalTestsAfter >= BADGE_THRESHOLDS.practice.dedicated) {
    awards.push({
      key: "dedicated",
      metadata: { totalTests: totalTestsAfter },
    });
  }
  if (totalTestsAfter >= BADGE_THRESHOLDS.practice.grinder) {
    awards.push({
      key: "grinder",
      metadata: { totalTests: totalTestsAfter },
    });
  }

  // Special badges are only checked on the user's first completed game.
  if (firstCompletedGameRank !== null) {
    if (firstCompletedGameRank <= BADGE_THRESHOLDS.special.founder) {
      awards.push({
        key: "founder",
        metadata: { rank: firstCompletedGameRank },
      });
    }
    if (firstCompletedGameRank <= BADGE_THRESHOLDS.special.earlyAdopter) {
      awards.push({
        key: "early_adopter",
        metadata: { rank: firstCompletedGameRank },
      });
    }
    if (firstCompletedGameRank <= BADGE_THRESHOLDS.special.pioneer) {
      awards.push({
        key: "pioneer",
        metadata: { rank: firstCompletedGameRank },
      });
    }
  }

  // The server action later removes badges the user already owns.
  return awards;
}
