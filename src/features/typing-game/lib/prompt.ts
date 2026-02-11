import englishWords from "@/data/languages/english.json";

export function generateWords(count: number): string {
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * englishWords.words.length);
    words.push(englishWords.words[randomIndex]);
  }
  return words.join(" ");
}

export function addPunctuation(text: string): string {
  const sentences = text.split(" ");
  let result = "";
  for (let i = 0; i < sentences.length; i++) {
    result += sentences[i];
    if (i < sentences.length - 1) {
      const random = Math.random();
      if (random < 0.1) result += ",";
      else if (random < 0.15) result += ".";
      result += " ";
    }
  }
  return result + ".";
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

