import {
  BONUS,
  DAILY_BONUS,
  GAIN_MULTIPLIER,
  MAX_STREAK_DAYS,
  MAX_STREAK_MULTIPLIER,
} from "./xp-constants";

export type GameMode = "time" | "words" | "quote";

export type IncompleteRun = {
  seconds: number;
  accuracy: number;
};

export type CompletedRunInputs = {
  // Typed object containing every value needed to calculate XP for one completed
  // typing run.
  elapsedSeconds: number;
  accuracy: number;
  mode: GameMode;
  punctuation: boolean;
  numbers: boolean;
  cleanRun: boolean;
  streakDaysAfter: number;
  incompleteRuns: IncompleteRun[];
  currentTotalXp: number;
  isFirstCompletedToday: boolean;
};

export type XpContribution = {
  // One visible line in the XP breakdown UI, such as "time typing" or "daily
  // bonus".
  id: string;
  label: string;
  value: number;
};

export type XpBreakdown = {
  // Final XP result returned to the server action and UI.
  contributions: XpContribution[];
  total: number;
};

function clamp(value: number, lo: number, hi: number): number {
  // Clamp keeps a number inside a safe minimum and maximum range.
  return Math.min(hi, Math.max(lo, value));
}

function streakBonusMultiplier(streakDaysAfter: number): number {
  // Streak bonus grows linearly until MAX_STREAK_DAYS, then stops increasing.
  const clamped = clamp(streakDaysAfter, 0, MAX_STREAK_DAYS);
  return (clamped / MAX_STREAK_DAYS) * MAX_STREAK_MULTIPLIER;
}

function accuracyScale(accuracy: number): number {
  // Accuracy below 50% gives no XP from the completed run. 100% gives full XP.
  return Math.max(0, (accuracy - 50) / 50);
}

export function computeXp(input: CompletedRunInputs): XpBreakdown {
  // Base XP comes from time spent typing. Negative elapsed time is protected
  // against with Math.max.
  const baseXp = Math.max(0, input.elapsedSeconds * 2);

  type RawBonus = { id: string; label: string; bonusValue: number };
  // Raw bonuses are multiplier values. They are collected first, then applied to
  // base XP together.
  const rawBonuses: RawBonus[] = [];
  if (input.accuracy >= 100) {
    rawBonuses.push({ id: "accuracy100", label: "perfect", bonusValue: BONUS.accuracy100 });
  }
  if (input.cleanRun) {
    rawBonuses.push({ id: "cleanRun", label: "clean", bonusValue: BONUS.cleanRun });
  }
  if (input.mode === "quote") {
    rawBonuses.push({ id: "quote", label: "quote", bonusValue: BONUS.quote });
  }
  if (input.punctuation) {
    rawBonuses.push({ id: "punctuation", label: "punctuation", bonusValue: BONUS.punctuation });
  }
  if (input.numbers) {
    rawBonuses.push({ id: "numbers", label: "numbers", bonusValue: BONUS.numbers });
  }
  // Streak bonus depends on the streak after this completed game.
  const streakMul = streakBonusMultiplier(input.streakDaysAfter);
  if (streakMul > 0) {
    rawBonuses.push({ id: "streak", label: "streak", bonusValue: streakMul });
  }

  // Sum all bonus multipliers and apply them to base XP.
  const modifierSum = rawBonuses.reduce((s, b) => s + b.bonusValue, 0);
  const afterModifiersExact = baseXp * (1 + modifierSum);

  // Accuracy scales the modified XP. If accuracy is below 100%, this can create
  // a negative contribution called "accuracy penalty".
  const accScale = accuracyScale(input.accuracy);
  const afterAccuracyExact = afterModifiersExact * accScale;
  const accuracyPenaltyExact = afterAccuracyExact - afterModifiersExact;

  // Incomplete runs are stored from abandoned attempts and converted into small
  // XP contributions on the next completed game.
  const incompleteXp = input.incompleteRuns.reduce((acc, run) => {
    const contribution = Math.round(
      Math.max(0, run.seconds) * accuracyScale(run.accuracy)
    );
    return acc + Math.max(0, contribution);
  }, 0);

  // Apply any global gain multiplier after completed-run and incomplete-run XP.
  const subtotalExact = afterAccuracyExact + incompleteXp;
  const afterGainExact = subtotalExact * GAIN_MULTIPLIER;

  const currentTotalXp = Math.max(0, input.currentTotalXp);
  // First completed game of the day can earn a daily bonus based on current
  // total XP, with min/max limits from constants.
  const dailyBonus = input.isFirstCompletedToday
    ? clamp(
        Math.round(currentTotalXp * DAILY_BONUS.percent),
        DAILY_BONUS.min,
        DAILY_BONUS.max
      )
    : 0;

  // Contributions are the display lines shown to the user. They add up to the
  // final total after rounding correction below.
  const contributions: XpContribution[] = [];

  const timeTyping = Math.round(baseXp);
  contributions.push({ id: "time", label: "time typing", value: timeTyping });

  // Convert each multiplier into a visible XP amount based on base XP.
  for (const b of rawBonuses) {
    const value = Math.round(baseXp * b.bonusValue);
    if (value !== 0) contributions.push({ id: b.id, label: b.label, value });
  }

  // Show accuracy scaling as a separate contribution when it changes the total.
  const accuracyPenalty = Math.round(accuracyPenaltyExact);
  if (accuracyPenalty !== 0) {
    contributions.push({ id: "accuracy", label: "accuracy penalty", value: accuracyPenalty });
  }

  // Add optional contributions only when they actually changed the score.
  if (incompleteXp > 0) {
    contributions.push({ id: "incomplete", label: "incomplete tests", value: incompleteXp });
  }

  if (GAIN_MULTIPLIER !== 1) {
    const gainDelta = Math.round(afterGainExact - subtotalExact);
    if (gainDelta !== 0) {
      contributions.push({ id: "gain", label: "gain multiplier", value: gainDelta });
    }
  }

  if (dailyBonus > 0) {
    contributions.push({ id: "daily", label: "daily bonus", value: dailyBonus });
  }

  // Rounding each contribution separately can drift away from the rounded final
  // total. This adjusts the time contribution so displayed lines sum correctly.
  const preTotal = contributions.reduce((s, c) => s + c.value, 0);
  const finalTotalExact = afterGainExact + dailyBonus;
  const total = Math.max(0, Math.round(finalTotalExact));
  const drift = total - preTotal;
  if (drift !== 0) {
    const idx = contributions.findIndex((c) => c.id === "time");
    if (idx >= 0 && contributions[idx]) {
      contributions[idx] = {
        ...contributions[idx],
        value: contributions[idx].value + drift,
      };
    } else {
      contributions.push({ id: "adjustment", label: "adjustment", value: drift });
    }
  }

  return { contributions, total };
}
