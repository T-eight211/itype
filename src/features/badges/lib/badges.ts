import { BADGE_THRESHOLDS } from "./badge-thresholds";

export type BadgeCategory =
  // Categories are used by the UI to group and colour badges.
  | "speed"
  | "accuracy"
  | "streak"
  | "level"
  | "practice"
  | "special";

export type BadgeDefinition = {
  // Static badge metadata shown in profile, leaderboard and stats UI.
  key: string;
  name: string;
  description: string;
  category: BadgeCategory;
};

// Master list of all badges in the app. Threshold text is generated from
// BADGE_THRESHOLDS so descriptions stay aligned with the evaluator.
export const BADGES = [
  {
    key: "fast_fingers",
    name: "Fast Fingers",
    description: `Reach ${BADGE_THRESHOLDS.speed.fastFingersWpm} WPM.`,
    category: "speed",
  },
  {
    key: "speed_demon",
    name: "Speed Demon",
    description: `Reach ${BADGE_THRESHOLDS.speed.speedDemonWpm} WPM.`,
    category: "speed",
  },
  {
    key: "lightning_typist",
    name: "Lightning Typist",
    description: `Reach ${BADGE_THRESHOLDS.speed.lightningTypistWpm} WPM.`,
    category: "speed",
  },
  {
    key: "sharp_shooter",
    name: "Sharp Shooter",
    description: `Reach ${BADGE_THRESHOLDS.accuracy.sharpShooterAverage}%+ average accuracy.`,
    category: "accuracy",
  },
  {
    key: "perfect_run",
    name: "Perfect Run",
    description: `Reach ${BADGE_THRESHOLDS.accuracy.perfectRunAverage}% average accuracy.`,
    category: "accuracy",
  },
  {
    key: "getting_started",
    name: "Getting Started",
    description: `${BADGE_THRESHOLDS.streak.gettingStartedDays}-day streak.`,
    category: "streak",
  },
  {
    key: "consistent",
    name: "Consistent",
    description: `${BADGE_THRESHOLDS.streak.consistentDays}-day streak.`,
    category: "streak",
  },
  {
    key: "unstoppable",
    name: "Unstoppable",
    description: `${BADGE_THRESHOLDS.streak.unstoppableDays}-day streak.`,
    category: "streak",
  },
  {
    key: "level_up",
    name: "Level Up",
    description: `Reach level ${BADGE_THRESHOLDS.level.levelUp}.`,
    category: "level",
  },
  {
    key: "pro_typist",
    name: "Pro Typist",
    description: `Reach level ${BADGE_THRESHOLDS.level.proTypist}.`,
    category: "level",
  },
  {
    key: "master_typist",
    name: "Master Typist",
    description: `Reach level ${BADGE_THRESHOLDS.level.masterTypist}.`,
    category: "level",
  },
  {
    key: "first_steps",
    name: "First Steps",
    description: "Complete your first test.",
    category: "practice",
  },
  {
    key: "dedicated",
    name: "Dedicated",
    description: `Complete ${BADGE_THRESHOLDS.practice.dedicated} tests.`,
    category: "practice",
  },
  {
    key: "grinder",
    name: "Grinder",
    description: `Complete ${BADGE_THRESHOLDS.practice.grinder} tests.`,
    category: "practice",
  },
  {
    key: "founder",
    name: "Founder",
    description: `One of the first ${BADGE_THRESHOLDS.special.founder} players to finish a game.`,
    category: "special",
  },
  {
    key: "early_adopter",
    name: "Early Adopter",
    description: `One of the first ${BADGE_THRESHOLDS.special.earlyAdopter} players to finish a game.`,
    category: "special",
  },
  {
    key: "pioneer",
    name: "Pioneer",
    description: `One of the first ${BADGE_THRESHOLDS.special.pioneer} players to finish a game.`,
    category: "special",
  },
] as const satisfies readonly BadgeDefinition[];

// BadgeKey is a TypeScript union of every badge key in BADGES.
export type BadgeKey = (typeof BADGES)[number]["key"];
