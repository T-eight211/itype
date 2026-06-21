export type QuoteLengthFilter = "all" | "short" | "medium" | "long" | "thicc";

export type QuoteResult = {
  content: string;
  id?: string | null;
  source?: "quotable" | "local" | null;
};

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
  // Local quotes are imported on demand so the initial client bundle does not
  // have to load the full quote file before quote mode is used.
  const data = (await import("@/data/quotes/english.json")) as EnglishQuotesData;
  let pool = data.quotes;
  if (length !== "all") {
    // Quote length filters are stored as min/max groups inside the JSON data.
    const [minLen, maxLen] = data.groups[FILTER_TO_GROUP_INDEX[length]];
    pool = data.quotes.filter((q) => q.length >= minLen && q.length <= maxLen);
    if (pool.length === 0) pool = data.quotes;
  }
  const quote = pool[Math.floor(Math.random() * pool.length)];
  return {
    content: quote.text,
    id: String(quote.id),
    source: "local",
  };
}

export async function fetchQuote(length: QuoteLengthFilter): Promise<QuoteResult> {
  try {
    // Try the online quote API first, then fall back to the local quote dataset
    // so quote mode still works if the network request fails.
    const url = buildQuotableRandomUrl(length);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch quote: ${res.status}`);
    const data: { content?: string; _id?: string } = await res.json();
    if (data.content) {
      return {
        content: data.content,
        id: data._id ?? null,
        source: "quotable",
      };
    }
  } catch {
  }
  return getRandomQuoteFromLocal(length);
}

export function buildQuotableRandomUrl(length: QuoteLengthFilter): string {
  const base = "https://api.quotable.io/random";
  const params = new URLSearchParams();

  // Convert the selected quote length into the API query parameters expected by
  // Quotable. "all" leaves the URL unfiltered.
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
