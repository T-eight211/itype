import "server-only";

import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";

import {
  type TypingCoachAIAggregate,
  type TypingCoachAIInput,
  TypingCoachAIInputSchema,
} from "../schemas/ai-aggregate";
import {
  getTypingCoachAIAggregate,
  ROLLING_WINDOW_DAYS,
  type TypingCoachAIEligibility,
} from "./get-ai-aggregate";
import { generateTypingCoachOutput } from "./generate-output";
import { aggregateJsonForPrompt } from "./build-prompt";
import type { TypingCoachAIOutput } from "../schemas/ai-output";
import { TYPING_COACH_MODEL_ID } from "../lib/model-config";
import {
  TypingCoachInputError,
  TypingCoachModelError,
  TypingCoachOutputParseError,
} from "../lib/errors";

export type RunTypingCoachResult =
  | {
      kind: "ok";
      run_id: number;
      output: TypingCoachAIOutput;
      model_id: string;
    }
  | {
      kind: "not_authenticated";
      error: string;
    }
  | ({
      kind: "not_ready";
    } & TypingCoachAIEligibility)
  | {
      kind: "aggregate_error";
      error: string;
    }
  | {
      kind: "generation_failed";
      run_id: number;
      error_code:
        | "input_validation_failed"
        | "model_call_failed"
        | "output_parse_failed"
        | "unknown";
      message: string;
    };

function isAggregate(
  value: TypingCoachAIAggregate | { error: string } | TypingCoachAIEligibility
): value is TypingCoachAIAggregate {
  // Type guard: a real aggregate has user_id and words.
  return "user_id" in value && "words" in value;
}

function isEligibility(
  value: TypingCoachAIAggregate | { error: string } | TypingCoachAIEligibility
): value is TypingCoachAIEligibility {
  // Type guard: eligibility results always contain ready.
  return "ready" in value;
}

export async function runTypingCoachForUser(
  userId: string,
  windowDays: number = ROLLING_WINDOW_DAYS
): Promise<Exclude<RunTypingCoachResult, { kind: "not_authenticated" }>> {
  // Build the structured telemetry aggregate first. This may return "not ready"
  // instead of calling the model.
  const aggregateResult = await getTypingCoachAIAggregate(windowDays, { userId });

  if (isEligibility(aggregateResult) && aggregateResult.ready === false) {
    // User does not have enough sessions or non-pause errors yet.
    return { kind: "not_ready", ...aggregateResult };
  }
  if (!isAggregate(aggregateResult)) {
    // Aggregate failed or returned an unexpected shape.
    return {
      kind: "aggregate_error",
      error:
        "error" in aggregateResult
          ? aggregateResult.error
          : "Unknown aggregate error",
    };
  }

  // This is the exact input object passed through validation and then into the
  // prompt builder.
  const inputCandidate: TypingCoachAIInput = {
    aggregate: aggregateResult,
  };
  // Validate the aggregate before creating a model run row.
  const parsedInput = TypingCoachAIInputSchema.safeParse(inputCandidate);
  if (!parsedInput.success) {
    return {
      kind: "aggregate_error",
      error: `Aggregate failed input validation: ${parsedInput.error.message}`,
    };
  }

  // Create a pending run before the model call. This lets the UI show a pending
  // state while background generation is still running.
  const run = await prisma.typingCoachAiRun.create({
    data: {
      user_id: userId,
      status: "pending",
      model: TYPING_COACH_MODEL_ID,
      // Store the same reduced aggregate snapshot used for the prompt. This makes
      // the AI run auditable later without storing duplicated helper fields.
      input_snapshot: aggregateJsonForPrompt(parsedInput.data.aggregate) as unknown as object,
    },
    select: { id: true },
  });

  try {
    // Call the AI service and receive validated/normalised feedback items.
    const { output } = await generateTypingCoachOutput(parsedInput.data);

    // Mark the run completed and insert all feedback items in one transaction.
    await prisma.$transaction([
      prisma.typingCoachAiRun.update({
        where: { id: run.id },
        data: {
          status: "completed",
          completed_at: new Date(),
          error_message: null,
        },
      }),
      prisma.typingCoachAiFeedbackItem.createMany({
        data: output.items.map((item, sort_order) => ({
          // sort_order preserves the model's item order for display.
          run_id: run.id,
          sort_order,
          feedback_text: item.feedback,
          practice_words: item.practice_words,
        })),
      }),
    ]);

    // Return the saved run ID and output to the caller.
    return {
      kind: "ok",
      run_id: run.id,
      output,
      model_id: TYPING_COACH_MODEL_ID,
    };
  } catch (err) {
    // Convert known typed errors into stable error codes for database storage and
    // UI/debug messages.
    let code: "input_validation_failed" | "model_call_failed" | "output_parse_failed" | "unknown" =
      "unknown";
    if (err instanceof TypingCoachInputError) code = "input_validation_failed";
    else if (err instanceof TypingCoachModelError) code = "model_call_failed";
    else if (err instanceof TypingCoachOutputParseError)
      code = "output_parse_failed";

    const message = err instanceof Error ? err.message : String(err);

    // Mark the run as failed instead of leaving it pending forever.
    await prisma.typingCoachAiRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        error_message: `[${code}] ${message}`.slice(0, 1000),
      },
    });

    return {
      kind: "generation_failed",
      run_id: run.id,
      error_code: code,
      message,
    };
  }
}

export async function runTypingCoach(
  windowDays: number = ROLLING_WINDOW_DAYS
): Promise<RunTypingCoachResult> {
  // Public server function: get the current Clerk user, then run the user-scoped
  // generation flow.
  const { userId } = await auth();
  if (!userId) {
    return { kind: "not_authenticated", error: "Not signed in" };
  }

  return runTypingCoachForUser(userId, windowDays);
}
