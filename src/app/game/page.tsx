"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TypingGame } from "@/features/typing-game/components/typing-game";
import type { GameMode } from "@/features/typing-game/hooks/use-typing-game";

function parseGameMode(raw: string | null): GameMode | null {
  if (raw === "time" || raw === "words" || raw === "quote") return raw;
  return null;
}

function GameWithUrlMode() {
  const searchParams = useSearchParams();
  const urlMode = parseGameMode(searchParams.get("mode"));

  return (
    <div className="flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      <TypingGame urlMode={urlMode} />
    </div>
  );
}

export default function GamePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <GameWithUrlMode />
    </Suspense>
  );
}
