import "server-only";

import { generateObject } from "ai";

import { TypingCoachAIInputSchema } from "../schemas/ai-aggregate";
import {
  TypingCoachAIGenerateSchema,
  TypingCoachAIOutputSchema,
  type TypingCoachAIOutput,
  generatedToStoredOutput,
} from "../schemas/ai-output";
import {
  typingCoachModel,
  TYPING_COACH_GENERATION_PARAMS,
  TYPING_COACH_MODEL_ID,
} from "../lib/model-config";
import { buildTypingCoachPrompt } from "./build-prompt";
import {
  TypingCoachInputError,
  TypingCoachModelError,
  TypingCoachOutputParseError,
} from "../lib/errors";

export type GenerateTypingCoachOutputResult = {
  output: TypingCoachAIOutput;
  model_id: string;
};

export async function generateTypingCoachOutput(
  rawInput: unknown
): Promise<GenerateTypingCoachOutputResult> {
  // Validate the aggregate input before building a prompt. This catches bad
  // server data before it reaches the model call.
  const parsedInput = TypingCoachAIInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new TypingCoachInputError(
      `Invalid TypingCoachAIInput: ${parsedInput.error.message}`,
      { cause: parsedInput.error }
    );
  }

  // Turn the validated aggregate into the system/user prompt messages.
  const { system, user } = buildTypingCoachPrompt(parsedInput.data);

  let modelResult;
  try {
    // generateObject asks the model for structured JSON and checks it against
    // TypingCoachAIGenerateSchema during generation.
    modelResult = await generateObject({
      model: typingCoachModel,
      schema: TypingCoachAIGenerateSchema,
      system,
      prompt: user,
      ...TYPING_COACH_GENERATION_PARAMS,
    });
  } catch (err) {
    // Model/API failures are wrapped in a typed error so callers can store a
    // useful failure code.
    throw new TypingCoachModelError(
      `Typing coach model call failed: ${(err as Error)?.message ?? String(err)}`,
      { cause: err }
    );
  }

  // Validate the raw object returned by the AI SDK. This is a second guard before
  // normalising the output for storage.
  const genParse = TypingCoachAIGenerateSchema.safeParse(modelResult.object);
  if (!genParse.success) {
    throw new TypingCoachOutputParseError(
      `Typing coach raw output failed generate-schema validation: ${genParse.error.message}`,
      {
        cause: genParse.error,
        rawSnippet: JSON.stringify(modelResult.object),
      }
    );
  }

  let output: TypingCoachAIOutput;
  try {
    // Normalise practice words and remove invalid/empty generated items before
    // saving anything to the database.
    output = generatedToStoredOutput(genParse.data);
  } catch (err) {
    throw new TypingCoachOutputParseError(
      `Typing coach output normalisation failed: ${err instanceof Error ? err.message : String(err)}`,
      {
        cause: err,
        rawSnippet: JSON.stringify(modelResult.object),
      }
    );
  }

  // Final validation checks the stored output shape after normalisation.
  const finalParse = TypingCoachAIOutputSchema.safeParse(output);
  if (!finalParse.success) {
    throw new TypingCoachOutputParseError(
      `Typing coach output failed final validation: ${finalParse.error.message}`,
      {
        cause: finalParse.error,
        rawSnippet: JSON.stringify(output),
      }
    );
  }

  // Return both the safe output and the model ID used for this run.
  return {
    output: finalParse.data,
    model_id: TYPING_COACH_MODEL_ID,
  };
}
