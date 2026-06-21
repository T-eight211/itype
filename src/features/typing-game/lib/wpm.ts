import { computeAlignment } from "./alignment";

export function getCorrectCharsSoFar(prompt: string, input: string): number {
  if (!prompt || !input) return 0;

  // Split by words so WPM only rewards words that are still matching the target.
  // This avoids giving WPM credit for a word after it has drifted from the prompt.
  const targetWords = prompt.split(" ");
  const typedWords = input.split(" ");
  const count = Math.max(targetWords.length, typedWords.length);

  let total = 0;

  for (let i = 0; i < count; i++) {
    const target = targetWords[i] ?? "";
    const typed = typedWords[i] ?? "";

    if (!typed) continue;
    // If the typed word is longer than the target or no longer matches the
    // target prefix, it does not contribute to corrected WPM.
    if (typed.length > target.length || !target.startsWith(typed)) continue;

    const userTypedSpaceAfter = i < typedWords.length - 1;
    const targetHasSpaceAfter = i < targetWords.length - 1;

    if (userTypedSpaceAfter && typed.length < target.length) continue;

    total += typed.length;
    // Count a correct space after a completed word because it is part of the
    // prompt text and contributes to the standard character count.
    if (targetHasSpaceAfter && userTypedSpaceAfter && typed.length === target.length) {
      total += 1;
    }
  }

  return total;
}

export function charsToWpm(chars: number, seconds: number): number {
  // Standard typing formula: five characters count as one word, divided by
  // elapsed minutes.
  const minutes = seconds / 60;
  return minutes > 0 ? (chars / 5) / minutes : 0;
}

export function computeRawChars(prompt: string, input: string): number {
  // Raw WPM includes typed prompt characters, but removes extra alignment cells
  // so inserted characters do not inflate the raw character count.
  const align = computeAlignment(prompt, input);
  const extraCount = align.cells.filter((c) => c.type === "extra").length;
  return Math.max(0, input.length - extraCount);
}
