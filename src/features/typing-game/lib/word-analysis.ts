import focusBigramsData from "@/data/languages/english/english_focus_bigrams.json";
import focusTrigramsData from "@/data/languages/english/english_focus_trigrams.json";

const focusBigramSet = new Set(
  focusBigramsData.bigrams.map((b: string) => b.toUpperCase())
);

const focusTrigramSet = new Set(
  focusTrigramsData.trigrams.map((t: string) => t.toUpperCase())
);

export function hasRepeatPattern(word: string): boolean {
  const w = word.toLowerCase();
  for (let i = 0; i < w.length - 1; i++) {
    if (w[i] === w[i + 1]) return true;
  }
  for (let len = 2; len <= Math.floor(w.length / 2); len++) {
    for (let i = 0; i <= w.length - len; i++) {
      const sub = w.slice(i, i + len);
      if (w.indexOf(sub, i + 1) !== -1) return true;
    }
  }
  return false;
}

export function hasFocusBigram(word: string): boolean {
  if (word.length <= 2) return false;
  const upper = word.toUpperCase();
  for (let i = 0; i < upper.length - 1; i++) {
    if (focusBigramSet.has(upper.slice(i, i + 2))) return true;
  }
  return false;
}

export function hasFocusTrigram(word: string): boolean {
  if (word.length <= 3) return false;
  const upper = word.toUpperCase();
  for (let i = 0; i < upper.length - 2; i++) {
    if (focusTrigramSet.has(upper.slice(i, i + 3))) return true;
  }
  return false;
}
