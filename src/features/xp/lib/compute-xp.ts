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
  id: string;
  label: string;
  value: number;
};

export type XpBreakdown = {
  contributions: XpContribution[];
  total: number;
};

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function streakBonusMultiplier(streakDaysAfter: number): number {
  const clamped = clamp(streakDaysAfter, 0, MAX_STREAK_DAYS);
  return (clamped / MAX_STREAK_DAYS) * MAX_STREAK_MULTIPLIER;
}

function accuracyScale(accuracy: number): number {
  return Math.max(0, (accuracy - 50) / 50);
}

export function computeXp(input: CompletedRunInputs): XpBreakdown {
  const baseXp = Math.max(0, input.elapsedSeconds * 2);

  type RawBonus = { id: string; label: string; bonusValue: number };
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
  const streakMul = streakBonusMultiplier(input.streakDaysAfter);
  if (streakMul > 0) {
    rawBonuses.push({ id: "streak", label: "streak", bonusValue: streakMul });
  }

  const modifierSum = rawBonuses.reduce((s, b) => s + b.bonusValue, 0);
  const afterModifiersExact = baseXp * (1 + modifierSum);

  const accScale = accuracyScale(input.accuracy);
  const afterAccuracyExact = afterModifiersExact * accScale;
  const accuracyPenaltyExact = afterAccuracyExact - afterModifiersExact;

  const incompleteXp = input.incompleteRuns.reduce((acc, run) => {
    const contribution = Math.round(
      Math.max(0, run.seconds) * accuracyScale(run.accuracy)
    );
    return acc + Math.max(0, contribution);
  }, 0);

  const subtotalExact = afterAccuracyExact + incompleteXp;
  const afterGainExact = subtotalExact * GAIN_MULTIPLIER;

  const currentTotalXp = Math.max(0, input.currentTotalXp);
  const dailyBonus = input.isFirstCompletedToday
    ? clamp(
        Math.round(currentTotalXp * DAILY_BONUS.percent),
        DAILY_BONUS.min,
        DAILY_BONUS.max
      )
    : 0;

  const contributions: XpContribution[] = [];

  const timeTyping = Math.round(baseXp);
  contributions.push({ id: "time", label: "time typing", value: timeTyping });

  for (const b of rawBonuses) {
    const value = Math.round(baseXp * b.bonusValue);
    if (value !== 0) contributions.push({ id: b.id, label: b.label, value });
  }

  const accuracyPenalty = Math.round(accuracyPenaltyExact);
  if (accuracyPenalty !== 0) {
    contributions.push({ id: "accuracy", label: "accuracy penalty", value: accuracyPenalty });
  }

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
