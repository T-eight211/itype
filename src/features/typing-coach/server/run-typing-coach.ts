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
  return "user_id" in value && "words" in value;
}

function isEligibility(
  value: TypingCoachAIAggregate | { error: string } | TypingCoachAIEligibility
): value is TypingCoachAIEligibility {
  return "ready" in value;
}

export async function runTypingCoachForUser(
  userId: string,
  windowDays: number = ROLLING_WINDOW_DAYS
): Promise<Exclude<RunTypingCoachResult, { kind: "not_authenticated" }>> {
  const aggregateResult = await getTypingCoachAIAggregate(windowDays, { userId });

  if (isEligibility(aggregateResult) && aggregateResult.ready === false) {
    return { kind: "not_ready", ...aggregateResult };
  }
  if (!isAggregate(aggregateResult)) {
    return {
      kind: "aggregate_error",
      error:
        "error" in aggregateResult
          ? aggregateResult.error
          : "Unknown aggregate error",
    };
  }

  const inputCandidate: TypingCoachAIInput = {
    aggregate: aggregateResult,
    goals: [],
  };
  const parsedInput = TypingCoachAIInputSchema.safeParse(inputCandidate);
  if (!parsedInput.success) {
    return {
      kind: "aggregate_error",
      error: `Aggregate failed input validation: ${parsedInput.error.message}`,
    };
  }

  const run = await prisma.typingCoachAiRun.create({
    data: {
      user_id: userId,
      status: "pending",
      model: TYPING_COACH_MODEL_ID,
      input_snapshot: parsedInput.data.aggregate as unknown as object,
    },
    select: { id: true },
  });

  try {
    const { output } = await generateTypingCoachOutput(parsedInput.data);

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
          run_id: run.id,
          sort_order,
          feedback_text: item.feedback,
          practice_words: item.practice_words,
        })),
      }),
    ]);

    return {
      kind: "ok",
      run_id: run.id,
      output,
      model_id: TYPING_COACH_MODEL_ID,
    };
  } catch (err) {
    let code: "input_validation_failed" | "model_call_failed" | "output_parse_failed" | "unknown" =
      "unknown";
    if (err instanceof TypingCoachInputError) code = "input_validation_failed";
    else if (err instanceof TypingCoachModelError) code = "model_call_failed";
    else if (err instanceof TypingCoachOutputParseError)
      code = "output_parse_failed";

    const message = err instanceof Error ? err.message : String(err);

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
  const { userId } = await auth();
  if (!userId) {
    return { kind: "not_authenticated", error: "Not signed in" };
  }

  return runTypingCoachForUser(userId, windowDays);
}
