"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

type FeedbackPayload =
  | { status: "loading" }
  | { status: "error" }
  | { status: "pending"; run_id: number }
  | { status: "none" }
  | {
      status: "ready";
      run_id: number;
      items: { feedback_text: string; practice_words: string[] }[];
      created_at: string;
    };

type CoachItem = { feedback_text: string; practice_words: string[] };

type TypingCoachFeedbackPanelProps = {
  feedback: FeedbackPayload | null;
  eligibilityHint: string;
  showEligibilityFallback: boolean;
  selectedCoachItem: CoachItem | null;
  streamResetKey: string;
  instantFeedbackText?: boolean;
};

const STREAM_MS_PER_CHAR = 14;

function HoverCardSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-4 w-52" />
    </div>
  );
}

function StreamedFeedbackText({ text, muted = false }: { text: string; muted?: boolean }) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    setShown("");
    if (!text) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, STREAM_MS_PER_CHAR);
    return () => window.clearInterval(id);
  }, [text]);

  return (
    <p
      className={`text-xs leading-relaxed whitespace-pre-wrap ${
        muted ? "text-muted-foreground" : "text-foreground"
      }`}
      aria-live="polite"
    >
      {shown}
    </p>
  );
}

export function TypingCoachFeedbackPanel({
  feedback,
  selectedCoachItem,
  streamResetKey,
  instantFeedbackText = false,
  eligibilityHint,
  showEligibilityFallback,
}: TypingCoachFeedbackPanelProps) {
  if (!feedback || feedback.status === "loading") {
    return <HoverCardSkeleton />;
  }

  if (feedback.status === "error") {
    if (showEligibilityFallback) {
      return <StreamedFeedbackText text={eligibilityHint} muted />;
    }
    return <StreamedFeedbackText text="Could not load coaching feedback. Try again in a moment." muted />;
  }

  if (feedback.status === "pending") {
    return <HoverCardSkeleton />;
  }

  if (feedback.status === "ready") {
    if (feedback.items.length === 0) {
      return <StreamedFeedbackText text="No coaching rows yet. Try regenerating." muted />;
    }

    if (selectedCoachItem) {
      return (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {instantFeedbackText ? (
            <p className="text-xs leading-relaxed whitespace-pre-wrap text-foreground">
              {selectedCoachItem.feedback_text}
            </p>
          ) : (
            <StreamedFeedbackText key={streamResetKey} text={selectedCoachItem.feedback_text} />
          )}
        </div>
      );
    }

    return <HoverCardSkeleton />;
  }

  if (showEligibilityFallback) {
    return <StreamedFeedbackText text={eligibilityHint} muted />;
  }

  return <StreamedFeedbackText text="No coaching feedback yet. Play more typed sessions to generate insights." muted />;
}
