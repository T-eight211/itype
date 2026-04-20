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
  const parsedInput = TypingCoachAIInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw new TypingCoachInputError(
      `Invalid TypingCoachAIInput: ${parsedInput.error.message}`,
      { cause: parsedInput.error }
    );
  }

  const { system, user } = buildTypingCoachPrompt(parsedInput.data);

  let modelResult;
  try {
    modelResult = await generateObject({
      model: typingCoachModel,
      schema: TypingCoachAIGenerateSchema,
      system,
      prompt: user,
      ...TYPING_COACH_GENERATION_PARAMS,
    });
  } catch (err) {
    throw new TypingCoachModelError(
      `Typing coach model call failed: ${(err as Error)?.message ?? String(err)}`,
      { cause: err }
    );
  }

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
    output = generatedToStoredOutput(genParse.data);
  } catch (err) {
    throw new TypingCoachOutputParseError(
      `Typing coach output normalization failed: ${err instanceof Error ? err.message : String(err)}`,
      {
        cause: err,
        rawSnippet: JSON.stringify(modelResult.object),
      }
    );
  }

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

  return {
    output: finalParse.data,
    model_id: TYPING_COACH_MODEL_ID,
  };
}
