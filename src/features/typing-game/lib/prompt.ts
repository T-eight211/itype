import englishWords from "@/data/languages/english.json";
import contractionsData from "@/data/languages/english/english_common_contractions.json";

const contractions = contractionsData.words as string[];

const MAX_WORD_PICK_ATTEMPTS = 100;

export function generateWords(count: number): string {
  const pool = englishWords.words;
  const poolLen = pool.length;
  const words: string[] = [];

  for (let i = 0; i < count; i++) {
    const prev = words[words.length - 1];
    const prev2 = words[words.length - 2];

    let candidate = pool[0] ?? "";
    for (let attempt = 0; attempt < MAX_WORD_PICK_ATTEMPTS; attempt++) {
      const idx = Math.floor(Math.random() * poolLen);
      candidate = pool[idx] ?? candidate;
      if (candidate !== prev && candidate !== prev2) break;
    }
    words.push(candidate);
  }

  return words.join(" ");
}

export function addPunctuation(text: string): string {
  let words = text.split(" ");

  
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


    if (nextWordCapitalized && word.length > 0) {
      word = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      nextWordCapitalized = false;
    }

 
    const wrapInQuotes = Math.random() < 0.02;
    if (wrapInQuotes) result += '"';
    result += word;
    if (wrapInQuotes) result += '"';

    if (i < words.length - 1) {
      const r = Math.random();
      let punct = "";
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
  const numWords = Math.floor(words.length * 0.1);
  for (let i = 0; i < numWords; i++) {
    const randomIndex = Math.floor(Math.random() * words.length);
    words[randomIndex] = Math.floor(Math.random() * 1000).toString();
  }
  return words.join(" ");
}

