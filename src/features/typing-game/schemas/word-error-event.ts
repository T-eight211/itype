import { z } from "zod";

export const KeyboardRowSchema = z
  .enum(["number", "top", "home", "bottom", "space"])
  .describe("Physical keyboard row the key sits on (ANSI QWERTY).");

export const FingerSchema = z
  .enum([
    "left_pinky",
    "left_ring",
    "left_middle",
    "left_index",
    "right_index",
    "right_middle",
    "right_ring",
    "right_pinky",
    "thumb",
  ])
  .describe(
    "Which finger is expected / actually used. Combines hand + finger from the layout geometry."
  );

export const PositionInWordSchema = z
  .enum(["start", "middle", "end", "whole"])
  .describe("Where in the target word the error occurs.");

export const ErrorTypeSchema = z
  .enum([
    "substitution",
    "transposition",
    "omission",
    "insertion",
    "pause",
  ])
  .describe(
    "Discriminator for the kind of typing error. " +
      "substitution = wrong key(s), single or consecutive sequence; " +
      "transposition = two adjacent chars swapped; omission = expected char(s) missing; " +
      "insertion = extra char(s) typed; pause = hesitation > 750 ms between keystrokes."
  )
  .meta({
    db_column: "word_error_events.error_type",
  });

export const KeyPairDetailSchema = z
  .object({
    expected: z
      .string()
      .min(1)
      .describe("The character that should have been typed."),
    actual: z
      .string()
      .min(1)
      .describe("The character that was actually typed."),
    keyboard_row_expected: KeyboardRowSchema,
    keyboard_row_actual: KeyboardRowSchema,
    finger_expected: FingerSchema,
    finger_actual: FingerSchema,
    key_distance: z
      .number()
      .nonnegative()
      .describe("Euclidean grid-unit distance between expected and actual keys."),
    adjacent_key_slip: z
      .boolean()
      .describe("True when keys are direct physical neighbours."),
    same_hand: z
      .boolean()
      .describe("Both keys struck by the same hand."),
    same_finger: z
      .boolean()
      .describe("Both keys struck by the same finger."),
  })
  .describe("Keyboard-geometry detail for one expected→actual character pair.");

const SubstitutionDetailsSchema = z
  .object({
    pairs: z
      .array(KeyPairDetailSchema)
      .min(1)
      .describe("One entry per substituted character. Length 1 for single-char, 2+ for consecutive sequence."),
  })
  .describe(
    "Substitution keyboard detail (single or sequence). " +
      "AI: for sequences, if all pairs share same_hand=true the user may be shifted one key over; " +
      "use key_distance and adjacent_key_slip to distinguish motor slips from cognitive confusion."
  )
  .meta({
    db_column: "word_error_events.details_jsonb",
  });

const TranspositionDetailsSchema = z
  .object({
    pairs: z
      .array(KeyPairDetailSchema)
      .length(2)
      .describe("Exactly 2 entries - the two swapped characters."),
  })
  .describe(
    "Transposition detail. AI: very common for cross-hand bigrams; if same_hand check finger ordering."
  )
  .meta({
    db_column: "word_error_events.details_jsonb",
  });

const OmissionDetailsSchema = z
  .object({
    omitted_chars: z
      .array(
        z.object({
          expected: z
            .string()
            .min(1),
          keyboard_row_expected: KeyboardRowSchema,
          finger_expected: FingerSchema,
        })
      )
      .min(1)
      .describe("Each character that was skipped."),
    ended_by_space: z
      .boolean()
      .optional()
      .describe("True when user hit space before finishing the word."),
  })
  .describe(
    "Omission detail. AI: ended_by_space=true usually means the user moved on early, " +
      "not that they forgot the letters."
  )
  .meta({ db_column: "word_error_events.details_jsonb" });

const InsertionDetailsSchema = z
  .object({
    inserted_chars: z
      .array(
        z.object({
          actual: z
            .string()
            .min(1),
          keyboard_row_actual: KeyboardRowSchema,
          finger_actual: FingerSchema,
        })
      )
      .min(1)
      .describe("Each character that was inserted."),
    trailing_insertion: z
      .boolean()
      .optional()
      .describe("True when extra characters appear after the last expected character."),
  })
  .describe(
    "Insertion detail. AI: trailing_insertion often means the user stuttered on the " +
      "final key rather than a cognitive error."
  )
  .meta({ db_column: "word_error_events.details_jsonb" });

const PauseDetailsSchema = z
  .object({
    after_char: z
      .string()
      .describe("The character typed before the pause."),
    before_expected_char: z
      .string()
      .describe("The next expected character after the pause."),
  })
  .describe(
    "Pause detail. AI: a pause between two chars from different hands is normal; " +
      "same-hand pauses suggest motor planning difficulty for that bigram."
  )
  .meta({
    db_column: "word_error_events.details_jsonb",
  });

const WordErrorEventBaseSchema = z.object({
  event_order: z
    .number()
    .int()
    .nonnegative()
    .describe("0-based ordering of events within the word attempt.")
    .meta({
      db_column: "word_error_events.event_order",
    }),
  corrected: z
    .boolean()
    .nullable()
    .describe(
      "Whether the user later backspaced and fixed this error. " +
        "null for pause events (no correction concept)."
    )
    .meta({
      db_column: "word_error_events.corrected",
    }),
  char_index_start: z
    .number()
    .int()
    .nonnegative()
    .describe("0-based inclusive start index in the TARGET word.")
    .meta({
      db_column: "word_error_events.char_index_start",
    }),
  char_index_end: z
    .number()
    .int()
    .nonnegative()
    .describe("0-based inclusive end index in the TARGET word.")
    .meta({
      db_column: "word_error_events.char_index_end",
    }),
  position_in_word: PositionInWordSchema,
  expected_text: z
    .string()
    .describe(
      "The expected character(s) from the target word. Empty string for insertions."
    )
    .meta({
      db_column: "word_error_events.expected_text",
    }),
  actual_text: z
    .string()
    .describe(
      "What the user actually typed. Empty string for omissions and pauses."
    )
    .meta({
      db_column: "word_error_events.actual_text",
    }),
  pause_ms: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe("Milliseconds of hesitation. Only set for pause events; null otherwise.")
    .meta({
      db_column: "word_error_events.pause_ms",
    }),
  preceded_by_pause: z
    .boolean()
    .default(false)
    .describe("True if a pause event (>750 ms) immediately preceded this error.")
    .meta({
      db_column: "word_error_events.preceded_by_pause",
    }),
});

export const SubstitutionEventSchema = WordErrorEventBaseSchema.extend({
  error_type: z.literal("substitution"),
  details_jsonb: SubstitutionDetailsSchema,
})
  .describe(
    "One or more consecutive wrong keys. " +
      "AI: for single-char, check adjacent_key_slip - true means motor slip; " +
      "for sequences, uniform key_distance across pairs suggests hand-shift, varied suggests distraction."
  );

export const TranspositionEventSchema = WordErrorEventBaseSchema.extend({
  error_type: z.literal("transposition"),
  details_jsonb: TranspositionDetailsSchema,
})
  .describe(
    "Two adjacent characters were swapped (e.g. 'ei' → 'ie'). " +
      "AI: very common for cross-hand bigrams; if same_hand check finger ordering."
  );

export const OmissionEventSchema = WordErrorEventBaseSchema.extend({
  error_type: z.literal("omission"),
  details_jsonb: OmissionDetailsSchema,
})
  .describe(
    "One or more expected characters were skipped. " +
      "AI: ended_by_space means the user hit space early; otherwise they may have mentally skipped a letter."
  );

export const InsertionEventSchema = WordErrorEventBaseSchema.extend({
  error_type: z.literal("insertion"),
  details_jsonb: InsertionDetailsSchema,
})
  .describe(
    "One or more extra characters were typed that don't exist in the target. " +
      "AI: trailing_insertion is usually a stutter; mid-word insertion may indicate a habitual key sequence."
  );

export const PauseEventSchema = WordErrorEventBaseSchema.extend({
  error_type: z.literal("pause"),
  corrected: z.null(),
  details_jsonb: PauseDetailsSchema,
})
  .describe(
    "A hesitation > 750 ms between keystrokes (capped at 2 000 ms for max_pause_ms aggregation). " +
      "AI: frequent pauses on the same bigram across games signal a weak motor pattern worth drilling."
  );

export const WordErrorEventSchema = z
  .discriminatedUnion("error_type", [
    SubstitutionEventSchema,
    TranspositionEventSchema,
    OmissionEventSchema,
    InsertionEventSchema,
    PauseEventSchema,
  ])
  .describe(
    "A single error or pause event recorded during a word attempt. " +
      "AI: group by error_type across sessions to find persistent weaknesses; " +
      "use details_jsonb for root-cause analysis (motor vs cognitive)."
  );

export type WordErrorEvent = z.infer<typeof WordErrorEventSchema>;
export type KeyPairDetail = z.infer<typeof KeyPairDetailSchema>;
export type KeyboardRow = z.infer<typeof KeyboardRowSchema>;
export type Finger = z.infer<typeof FingerSchema>;
export type ErrorType = z.infer<typeof ErrorTypeSchema>;
export type PositionInWord = z.infer<typeof PositionInWordSchema>;
