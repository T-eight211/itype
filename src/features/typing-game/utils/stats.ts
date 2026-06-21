export function mean(arr: number[]): number {
  // Average helper used by consistency and graph calculations.
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function stdDev(arr: number[]): number {
  // Standard deviation measures how spread out burst WPM values are.
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const squareDiffs = arr.map((v) => (v - m) ** 2);
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / arr.length);
}

export function roundTo2(n: number): number {
  // Keep stored/displayed numeric metrics readable and stable.
  return Math.round(n * 100) / 100;
}

export function formatWpm(n: number): string {
  // WPM is displayed with two decimals in result screens.
  return roundTo2(n).toFixed(2);
}

// -----------------------------------------------------------------------------
// This section of code was obtained from the Monkeytype project:
// https://github.com/monkeytypegame/monkeytype/blob/refs/heads/master/packages/util/src/numbers.ts
// -----------------------------------------------------------------------------

export function kogasa(cov: number): number {
  return (
    100 * (1 - Math.tanh(cov + Math.pow(cov, 3) / 3 + Math.pow(cov, 5) / 5))
  );
}

// -----------------------------------------------------------------------------
// End
// -----------------------------------------------------------------------------

export function computeConsistency(burstWpm: number[]): number {
  // Consistency is calculated from variation in burst WPM. Lower variation gives
  // a higher score, using the Monkeytype-derived kogasa formula below.
  if (!burstWpm.length) return 0;
  const m = mean(burstWpm);
  if (m === 0) return 0;
  const sd = stdDev(burstWpm);
  const cv = sd / m;
  const result = roundTo2(kogasa(cv));
  return Number.isNaN(result) ? 0 : result;
}
