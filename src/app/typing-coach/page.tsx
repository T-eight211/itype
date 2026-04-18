import { getTypingCoachAIAggregate } from "@/features/typing-coach/server/get-ai-aggregate";

type PageProps = {
  searchParams?: Promise<{ window?: "last_30d" | "lifetime" }>;
};

export default async function TypingCoachPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const windowParam = resolvedSearchParams.window;
  const window =
    windowParam === "last_30d" || windowParam === "lifetime" ? windowParam : "last_30d";

  const result = await getTypingCoachAIAggregate(window);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Typing Coach Aggregate (Test)</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Window: <span className="font-mono">{window}</span>
      </p>
      <pre className="mt-6 overflow-auto rounded-lg border bg-muted/40 p-4 text-xs leading-6">
        {JSON.stringify(result, null, 2)}
      </pre>
    </main>
  );
}
