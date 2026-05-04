import {
  getTypingCoachAIAggregate,
  ROLLING_WINDOW_DAYS,
} from "@/features/typing-coach/server/get-ai-aggregate";
import { TypingCoachJsonPanel } from "./typing-coach-json-panel";

type PageProps = {
  searchParams?: Promise<{ window?: string }>;
};

function parseCoachWindowDays(raw: string | undefined): number {
  if (raw === undefined || raw === "") return ROLLING_WINDOW_DAYS;
  if (raw === "last_30d") return ROLLING_WINDOW_DAYS;
  const n = Number.parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 1) return n;
  return ROLLING_WINDOW_DAYS;
}


function aggregateJsonForDisplay(data: unknown): unknown {
  if (data === null || typeof data !== "object") return data;
  const o = data as Record<string, unknown>;
  if (typeof o.user_id !== "string" || !Array.isArray(o.words)) return data;
  const { top_words: _tw, top_error_patterns: _tep, ...rest } = o;
  return rest;
}

export default async function TypingCoachPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const windowDays = parseCoachWindowDays(resolvedSearchParams.window);

  const result = await getTypingCoachAIAggregate(windowDays);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Typing Coach Aggregate (Test)</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        <strong>Note:</strong> This is a test page. The data is not real. JSON matches the coach
        prompt: <span className="font-mono">words</span> only — no{" "}
        <span className="font-mono">top_words</span> or <span className="font-mono">top_error_patterns</span>.
        Window: <span className="font-mono">last {windowDays}d</span>{" "}
        <span className="text-muted-foreground">(window_days={windowDays})</span>
      </p>
      <TypingCoachJsonPanel data={aggregateJsonForDisplay(result)} />
    </main>
  );
}
