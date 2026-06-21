import englishWords from "@/data/languages/english.json";
import contractionsData from "@/data/languages/english/english_common_contractions.json";

const contractions = contractionsData.words as string[];

const MAX_WORD_PICK_ATTEMPTS = 100;

const COACH_PRACTICE_TOKEN = /^[a-z]+(?:'[a-z]+)*$/;

function normalizeCoachPracticeToken(raw: string): string | null {
  // AI coach practice words are cleaned before they are mixed into the prompt.
  // This keeps generated prompts compatible with the typing engine.
  const w = raw.trim().toLowerCase().replace(/[^a-z']/g, "");
  if (w.length === 0 || !COACH_PRACTICE_TOKEN.test(w)) return null;
  return w;
}

export function generateWords(count: number): string {
  // Word mode and time mode use this list-based generator. The output is a
  // simple space-separated string that becomes displayText in the game hook.
  const pool = englishWords.words;
  const poolLen = pool.length;
  const words: string[] = [];

  for (let i = 0; i < count; i++) {
    const prev = words[words.length - 1];
    const prev2 = words[words.length - 2];

    let candidate = pool[0] ?? "";
    // Avoid repeating the same word too close together so generated prompts
    // feel more natural.
    for (let attempt = 0; attempt < MAX_WORD_PICK_ATTEMPTS; attempt++) {
      const idx = Math.floor(Math.random() * poolLen);
      candidate = pool[idx] ?? candidate;
      if (candidate !== prev && candidate !== prev2) break;
    }
    words.push(candidate);
  }

  return words.join(" ");
}

export function generateWordsWithCoachPool(
  count: number,
  coachPool: string[],
  coachProbability: number
): string {
  // Normalise and deduplicate coach words. Deduplicate means repeated practice
  // tokens are reduced to one copy before random selection.
  const normalized = [
    ...new Set(
      coachPool
        .map((w) => normalizeCoachPracticeToken(w))
        .filter((w): w is string => w !== null)
    ),
  ];
  if (normalized.length === 0 || coachProbability <= 0) {
    return generateWords(count);
  }

  const pool = englishWords.words;
  const poolLen = pool.length;
  const coachLen = normalized.length;
  const words: string[] = [];

  for (let i = 0; i < count; i++) {
    const prev = words[words.length - 1];
    const prev2 = words[words.length - 2];

    let candidate = pool[0] ?? "";
    const useCoach = Math.random() < coachProbability;

    if (useCoach) {
      // With the configured probability, choose a word from the AI coach pool
      // instead of the normal English word list.
      for (let attempt = 0; attempt < MAX_WORD_PICK_ATTEMPTS; attempt++) {
        candidate =
          normalized[Math.floor(Math.random() * coachLen)] ?? candidate;
        if (candidate !== prev && candidate !== prev2) break;
      }
    } else {
      // Otherwise use the normal word source, with the same repeat guard.
      for (let attempt = 0; attempt < MAX_WORD_PICK_ATTEMPTS; attempt++) {
        const idx = Math.floor(Math.random() * poolLen);
        candidate = pool[idx] ?? candidate;
        if (candidate !== prev && candidate !== prev2) break;
      }
    }
    words.push(candidate);
  }

  return words.join(" ");
}

export function addPunctuation(text: string): string {
  let words = text.split(" ");

  // Some words are replaced with common contractions when punctuation mode is
  // active, adding apostrophe practice without changing the main word generator.
  const contractionRate = 0.08;
  words = words.map((word) =>
    Math.random() < contractionRate
      ? contractions[Math.floor(Math.random() * contractions.length)]
      : word
  );

  let result = "";
  let nextWordCapitalized = true; 

  for (let i = 0; i < words.length; i++) {
    let word = words[i];

    // Capitalise the first word and the word after sentence-ending punctuation.
    if (nextWordCapitalized && word.length > 0) {
      word = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      nextWordCapitalized = false;
    }

    // A small percentage of words are wrapped in quotation marks.
    const wrapInQuotes = Math.random() < 0.02;
    if (wrapInQuotes) result += '"';
    result += word;
    if (wrapInQuotes) result += '"';

    if (i < words.length - 1) {
      const r = Math.random();
      let punct = "";
      // Punctuation is inserted by fixed probabilities. Most gaps stay as a
      // plain space; lower ranges add commas, full stops and other marks.
      if (r < 0.05) punct = ",";
      else if (r < 0.09) punct = ".";
      else if (r < 0.11) punct = ";";
      else if (r < 0.13) punct = ":";
      else if (r < 0.15) punct = "?";
      else if (r < 0.17) punct = "!";
      else if (r < 0.18) punct = " -";

      if (punct === "." || punct === "?" || punct === "!") {
        nextWordCapitalized = true;
      }

      result += punct;
      result += " ";
    }
  }
  return result.trimEnd() + ".";
}

export function addNumbers(text: string): string {
  const words = text.split(" ");
  // Number mode replaces roughly 10% of generated words with a number from
  // 0-999, then returns the same space-separated prompt format.
  const numWords = Math.floor(words.length * 0.1);
  for (let i = 0; i < numWords; i++) {
    const randomIndex = Math.floor(Math.random() * words.length);
    words[randomIndex] = Math.floor(Math.random() * 1000).toString();
  }
  return words.join(" ");
}
