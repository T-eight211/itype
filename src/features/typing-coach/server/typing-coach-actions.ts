"use server";

import { z } from "zod";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";

import type { TypingCoachAIOutput } from "../schemas/ai-output";

import { getTypingCoachAIEligibility, ROLLING_WINDOW_DAYS } from "./get-ai-aggregate";
import { runTypingCoach } from "./run-typing-coach";

function parsePracticeWordsJson(json: unknown): string[] {
  // practice_words is stored as JSON. Validate it before returning it to the
  // client, and fall back to an empty list if the stored value is not valid.
  const r = z.array(z.string()).safeParse(json);
  return r.success ? r.data : [];
}

export async function getTypingCoachEligibilityAction(
  windowDays: number = ROLLING_WINDOW_DAYS
) {
  // Server action used by the UI toggle to ask whether AI coaching is available.
  return getTypingCoachAIEligibility(windowDays);
}

export type TypingCoachFeedbackActionResult =
  | { error: "Not signed in" }
  | { status: "pending"; run_id: number }
  | { status: "none" }
  | {
      status: "ready";
      run_id: number;
      items: { feedback_text: string; practice_words: string[] }[];
      created_at: string;
    };

export async function getTypingCoachFeedbackAction(): Promise<TypingCoachFeedbackActionResult> {
  // Feedback is user-specific, so read the current Clerk user first.
  const { userId } = await auth();
  if (!userId) return { error: "Not signed in" };

  // If the latest run is still pending, return a pending state. The frontend can
  // poll this action until generation completes.
  const pending = await prisma.typingCoachAiRun.findFirst({
    where: { user_id: userId, status: "pending" },
    orderBy: { created_at: "desc" },
    select: { id: true, created_at: true },
  });

  if (pending) {
    return { status: "pending", run_id: pending.id };
  }

  // Otherwise fetch the latest completed run that has saved feedback items.
  const run = await prisma.typingCoachAiRun.findFirst({
    where: {
      user_id: userId,
      status: "completed",
      feedbackItems: { some: {} },
    },
    orderBy: { completed_at: "desc" },
    include: {
      feedbackItems: { orderBy: { sort_order: "asc" } },
    },
  });

  if (!run) {
    // No completed feedback exists yet.
    return { status: "none" };
  }

  // Convert feedback database rows into the simple shape used by the UI.
  const items = run.feedbackItems.map((row) => ({
    feedback_text: row.feedback_text,
    practice_words: parsePracticeWordsJson(row.practice_words),
  }));

  return {
    status: "ready",
    run_id: run.id,
    items,
    created_at: (run.completed_at ?? run.created_at).toISOString(),
  };
}

export type RunTypingCoachGenerateActionResult =
  | { ok: true; run_id: number; model_id: string; output: TypingCoachAIOutput }
  | { ok: false; error: string }
  | {
      ok: false;
      ready: false;
      reason: string;
      requirements: { min_sessions: number; min_non_pause_error_events: number };
      current: { session_count: number; non_pause_error_event_count: number };
      missing: { sessions_needed: number; non_pause_error_events_needed: number };
      message: string;
    }
  | {
      ok: false;
      run_id: number;
      error_code: string;
      error: string;
    };

export async function runTypingCoachGenerateAction(
  windowDays: number = ROLLING_WINDOW_DAYS
): Promise<RunTypingCoachGenerateActionResult> {
  // Manual generation action. It maps the internal union result into a simpler
  // action response shape for the client.
  const result = await runTypingCoach(windowDays);

  switch (result.kind) {
    case "ok":
      // Successful run with saved feedback output.
      return {
        ok: true,
        run_id: result.run_id,
        model_id: result.model_id,
        output: result.output,
      };

    case "not_authenticated":
      // No Clerk session.
      return { ok: false, error: result.error };

    case "not_ready": {
      // User is signed in but does not meet the data thresholds.
      if (result.ready === false) {
        return {
          ok: false as const,
          ready: false,
          reason: result.reason,
          requirements: result.requirements,
          current: result.current,
          missing: result.missing,
          message: result.message,
        };
      }
      return { ok: false, error: "AI coaching is not available yet." };
    }

    case "aggregate_error":
      // Aggregation/validation failed before the model call.
      return { ok: false, error: result.error };

    case "generation_failed":
      // Model call or output parsing failed after a pending run was created.
      return {
        ok: false,
        run_id: result.run_id,
        error_code: result.error_code,
        error: result.message,
      };

    default: {
      // Exhaustive TypeScript check in case a new result kind is added later.
      const _exhaustive: never = result;
      return { ok: false, error: "Unhandled result" };
    }
  }
}
