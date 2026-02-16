export type QuoteLengthFilter = "all" | "short" | "medium" | "long" | "thicc";

/** Response shape expected by the typing game (matches quotable API content field). */
export type QuoteResult = { content: string };

type LocalQuote = { text: string; source: string; length: number; id: number };
type EnglishQuotesData = { language: string; groups: number[][]; quotes: LocalQuote[] };

const FILTER_TO_GROUP_INDEX: Record<Exclude<QuoteLengthFilter, "all">, number> = {
  short: 0,
  medium: 1,
  long: 2,
  thicc: 3,
};


export async function getRandomQuoteFromLocal(
  length: QuoteLengthFilter
): Promise<QuoteResult> {
  const data = (await import("@/data/quotes/english.json")) as EnglishQuotesData;
  let pool = data.quotes;
  if (length !== "all") {
    const [minLen, maxLen] = data.groups[FILTER_TO_GROUP_INDEX[length]];
    pool = data.quotes.filter((q) => q.length >= minLen && q.length <= maxLen);
    if (pool.length === 0) pool = data.quotes;
  }
  const quote = pool[Math.floor(Math.random() * pool.length)];
  return { content: quote.text };
}

export async function fetchQuote(length: QuoteLengthFilter): Promise<QuoteResult> {
  try {
    const url = buildQuotableRandomUrl(length);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch quote: ${res.status}`);
    const data: { content?: string } = await res.json();
    if (data.content) return { content: data.content };
  } catch {
  }
  return getRandomQuoteFromLocal(length);
}

export function buildQuotableRandomUrl(length: QuoteLengthFilter): string {
  const base = "https://api.quotable.io/random";
  const params = new URLSearchParams();

  switch (length) {
    case "short":
      params.set("maxLength", "100");
      break;
    case "medium":
      params.set("minLength", "100");
      params.set("maxLength", "180");
      break;
    case "long":
      params.set("minLength", "180");
      params.set("maxLength", "260");
      break;
    case "thicc":
      params.set("minLength", "260");
      break;
    case "all":
    default:
      break;
  }

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

