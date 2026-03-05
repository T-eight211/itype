import { computeAlignment } from "./alignment";

export function getCorrectCharsSoFar(prompt: string, input: string): number {
  if (!prompt || !input) return 0;

  const targetWords = prompt.split(" ");
  const typedWords = input.split(" ");
  const count = Math.max(targetWords.length, typedWords.length);

  let total = 0;

  for (let i = 0; i < count; i++) {
    const target = targetWords[i] ?? "";
    const typed = typedWords[i] ?? "";

    if (!typed) continue;
    if (typed.length > target.length || !target.startsWith(typed)) continue;

    const userTypedSpaceAfter = i < typedWords.length - 1;
    const targetHasSpaceAfter = i < targetWords.length - 1;

    if (userTypedSpaceAfter && typed.length < target.length) continue;

    total += typed.length;
    if (targetHasSpaceAfter && userTypedSpaceAfter && typed.length === target.length) {
      total += 1;
    }
  }

  return total;
}

export function charsToWpm(chars: number, seconds: number): number {
  const minutes = seconds / 60;
  return minutes > 0 ? (chars / 5) / minutes : 0;
}

export function computeRawChars(prompt: string, input: string): number {
  const align = computeAlignment(prompt, input);
  const extraCount = align.cells.filter((c) => c.type === "extra").length;
  return Math.max(0, input.length - extraCount);
}
