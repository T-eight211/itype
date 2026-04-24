"use client";

import { cn } from "@/lib/utils";
import type { AwardXpSuccess } from "../server/award-xp-for-typing-result";

type Props = {
  award: AwardXpSuccess;
  className?: string;
};

function formatSigned(value: number): string {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

export function XpEarnedCard({ award, className }: Props) {
  const { breakdown } = award;
  return (
    <div
      className={cn(
        "mx-auto mt-6 flex w-full max-w-sm flex-col items-end gap-1 font-mono text-sm",
        className
      )}
    >
      <div
        className={cn(
          "text-3xl font-bold leading-none",
          breakdown.total > 0
            ? "text-amber-400"
            : breakdown.total < 0
            ? "text-red-500"
            : "text-foreground"
        )}
      >
        {formatSigned(breakdown.total)}
      </div>
      <div className="mt-1 flex flex-col items-end gap-0.5">
        {breakdown.contributions.map((c) => (
          <div key={c.id} className="flex items-center gap-3">
            <span className="text-muted-foreground">{c.label}</span>
            <span
              className={cn(
                "tabular-nums",
                c.value > 0 && "text-emerald-500",
                c.value < 0 && "text-red-500",
                c.value === 0 && "text-muted-foreground"
              )}
            >
              {formatSigned(c.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
