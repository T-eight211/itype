export const MAX_STREAK_DAYS = 30;
export const MAX_STREAK_MULTIPLIER = 0.5;

export const BONUS = {
  accuracy100: 0.5,
  cleanRun: 0.25,
  quote: 0.5,
  punctuation: 0.4,
  numbers: 0.1,
} as const;

export const GAIN_MULTIPLIER = 1;

export const DAILY_BONUS = {
  percent: 0.05,
  min: 100,
  max: 1000,
} as const;

export const LOCAL_INCOMPLETE_BUFFER_KEY = "itype:xp:incomplete:v1";

export const INCOMPLETE_BUFFER_MAX_ENTRIES = 50;

export const INCOMPLETE_MIN_SECONDS = 1;
