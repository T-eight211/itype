export type QuoteLengthFilter = "all" | "short" | "medium" | "long" | "thicc";

// Build a Quotable API URL for a random quote with approximate length buckets.
// These buckets are heuristic and can be tuned later.
export function buildQuotableRandomUrl(length: QuoteLengthFilter): string {
  const base = "https://api.quotable.io/random";
  const params = new URLSearchParams();

  switch (length) {
    case "short":
      // Very short snippets
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
      // No length constraint
      break;
  }

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

