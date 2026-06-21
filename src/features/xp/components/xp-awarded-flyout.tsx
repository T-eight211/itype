"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { subscribeXpAwarded } from "../lib/xp-events";
import type { AwardXpSuccess } from "../server/award-xp-for-typing-result";

const VISIBLE_MS = 6000;
const FADE_MS = 400;

function formatSigned(value: number): string {
  // Positive values are shown with + so XP gains are obvious.
  return value > 0 ? `+${value}` : `${value}`;
}

export function XpAwardedFlyout({ className }: { className?: string }) {
  // award stores the latest XP result to display. Null means the flyout is not
  // mounted.
  const [award, setAward] = React.useState<AwardXpSuccess | null>(null);
  // visible controls fade-in/fade-out CSS classes.
  const [visible, setVisible] = React.useState(false);
  // Timer refs store timeout ids without causing re-renders.
  const hideTimerRef = React.useRef<number | null>(null);
  const unmountTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    // Subscribe to the browser XP event. When XP is awarded, show the flyout,
    // then fade it out and remove it after the timers finish.
    return subscribeXpAwarded((next) => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (unmountTimerRef.current) window.clearTimeout(unmountTimerRef.current);
      setAward(next);
      setVisible(true);
      hideTimerRef.current = window.setTimeout(() => setVisible(false), VISIBLE_MS);
      unmountTimerRef.current = window.setTimeout(
        () => setAward(null),
        VISIBLE_MS + FADE_MS
      );
    });
  }, []);

  React.useEffect(() => {
    // Cleanup timers if the component unmounts before the timeout finishes.
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (unmountTimerRef.current) window.clearTimeout(unmountTimerRef.current);
    };
  }, []);

  if (!award) return null;

  // breakdown contains the total XP and the line-by-line contributions.
  const { breakdown } = award;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "pointer-events-none absolute top-full right-0 z-200 mt-2 rounded-md border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm flex flex-col items-end gap-0.5 whitespace-nowrap font-mono text-xs transition-all duration-400 ease-out",
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1",
        className
      )}
    >
      <div
        className={cn(
          "text-lg font-bold leading-none",
          breakdown.total > 0
            ? "text-amber-400"
            : breakdown.total < 0
            ? "text-red-500"
            : "text-foreground"
        )}
      >
        {formatSigned(breakdown.total)}
      </div>
      <div className="flex flex-col items-end gap-0.5">
        {/* Render every contribution line, such as time typing, streak or daily bonus. */}
        {breakdown.contributions.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
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
