export class TypingCoachInputError extends Error {
  readonly name = "TypingCoachInputError";
  readonly code = "input_validation_failed";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class TypingCoachModelError extends Error {
  readonly name = "TypingCoachModelError";
  readonly code = "model_call_failed";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class TypingCoachOutputParseError extends Error {
  readonly name = "TypingCoachOutputParseError";
  readonly code = "output_parse_failed";
  readonly rawSnippet?: string;

  constructor(message: string, options?: { cause?: unknown; rawSnippet?: string }) {
    super(message, { cause: options?.cause });
    this.rawSnippet = options?.rawSnippet?.slice(0, 500);
  }
}

export type TypingCoachError =
  | TypingCoachInputError
  | TypingCoachModelError
  | TypingCoachOutputParseError;
