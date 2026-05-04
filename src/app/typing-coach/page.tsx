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

export default async function TypingCoachPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const windowDays = parseCoachWindowDays(resolvedSearchParams.window);

  const result = await getTypingCoachAIAggregate(windowDays);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Typing Coach Aggregate (Test)</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        <strong>Note:</strong> This is a test page. The data is not real.
        Window: <span className="font-mono">last {windowDays}d</span>{" "}
        <span className="text-muted-foreground">(window_days={windowDays})</span>
      </p>
      <TypingCoachJsonPanel data={result} />
    </main>
  );
}
