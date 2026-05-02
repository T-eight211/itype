export function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const squareDiffs = arr.map((v) => (v - m) ** 2);
  return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / arr.length);
}

export function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatWpm(n: number): string {
  return roundTo2(n).toFixed(2);
}

export function kogasa(cov: number): number {
  return (
    100 * (1 - Math.tanh(cov + Math.pow(cov, 3) / 3 + Math.pow(cov, 5) / 5))
  );
}

export function computeConsistency(burstWpm: number[]): number {
  if (!burstWpm.length) return 0;
  const m = mean(burstWpm);
  if (m === 0) return 0;
  const sd = stdDev(burstWpm);
  const cv = sd / m;
  const result = roundTo2(kogasa(cv));
  return Number.isNaN(result) ? 0 : result;
}
