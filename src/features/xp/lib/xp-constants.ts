// Streak bonus is capped at 30 days so very long streaks do not make XP grow
// without limit.
export const MAX_STREAK_DAYS = 30;

// At the cap, streak can add up to 50% extra bonus value.
export const MAX_STREAK_MULTIPLIER = 0.5;

// Bonus multipliers used by computeXp(). For example, 0.5 means +50% of base XP.
export const BONUS = {
  accuracy100: 0.5,
  cleanRun: 0.25,
  quote: 0.5,
  punctuation: 0.4,
  numbers: 0.1,
} as const;

// Global multiplier kept as a constant so the whole XP economy can be tuned in
// one place without changing computeXp().
export const GAIN_MULTIPLIER = 1;

// Daily bonus is based on current total XP, but clamped between min and max so
// it is useful for new users and controlled for advanced users.
export const DAILY_BONUS = {
  percent: 0.05,
  min: 100,
  max: 1000,
} as const;

// localStorage key used to save short incomplete runs on the client.
export const LOCAL_INCOMPLETE_BUFFER_KEY = "itype:xp:incomplete:v1";

// Prevent the incomplete-run buffer from growing forever.
export const INCOMPLETE_BUFFER_MAX_ENTRIES = 50;

// Ignore incomplete runs shorter than this because they are too small to matter.
export const INCOMPLETE_MIN_SECONDS = 1;
