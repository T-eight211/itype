export class TypingCoachInputError extends Error {
  // Input validation failed before the model call.
  readonly name = "TypingCoachInputError";
  readonly code = "input_validation_failed";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class TypingCoachModelError extends Error {
  // The AI gateway/model call itself failed.
  readonly name = "TypingCoachModelError";
  readonly code = "model_call_failed";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class TypingCoachOutputParseError extends Error {
  // The model returned something that failed schema validation or normalisation.
  readonly name = "TypingCoachOutputParseError";
  readonly code = "output_parse_failed";
  readonly rawSnippet?: string;

  constructor(message: string, options?: { cause?: unknown; rawSnippet?: string }) {
    super(message, { cause: options?.cause });
    // Store only a short snippet so logs/database rows do not become too large.
    this.rawSnippet = options?.rawSnippet?.slice(0, 500);
  }
}

export type TypingCoachError =
  | TypingCoachInputError
  | TypingCoachModelError
  | TypingCoachOutputParseError;
