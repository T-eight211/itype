import { z } from "zod";

export const KeyboardRowSchema = z
  .enum(["number", "top", "home", "bottom", "space"])
  .describe("Physical keyboard row the key sits on (ANSI QWERTY).")
  .meta({
    dev: "Values match 'row' field in src/data/keyboard-layouts/geometry/qwerty.json",
    source: "qwerty.json → keys.row*[].row",
  });

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
  )
  .meta({
    dev: "Concatenation of qwerty.json hand + '_' + finger. 'thumb' is for spacebar only.",
    source: "qwerty.json → keys.row*[].hand + keys.row*[].finger",
  });

export const PositionInWordSchema = z
  .enum(["start", "middle", "end", "whole"])
  .describe("Where in the target word the error occurs.")
  .meta({
    dev: "Derived from char_index_start/end relative to word_length. 'whole' = error spans entire word.",
    derivation: "start: index==0; end: index==word_length-1; whole: start==0 && end==word_length-1; else middle",
  });

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
    dev: "Discriminator for z.discriminatedUnion. Each variant has a different details_jsonb shape.",
    grouping: "substitution covers both single and consecutive wrong chars; check char_index_start vs char_index_end to distinguish",
    db_column: "word_error_events.error_type",
  });

export const KeyPairDetailSchema = z
  .object({
    expected: z
      .string()
      .min(1)
      .describe("The character that should have been typed.")
      .meta({ dev: "Derived from target_word using char_index", source: "word_mistakes.target_word" }),
    actual: z
      .string()
      .min(1)
      .describe("The character that was actually typed.")
      .meta({ dev: "Captured from raw keystroke input at the moment of the error" }),
    keyboard_row_expected: KeyboardRowSchema,
    keyboard_row_actual: KeyboardRowSchema,
    finger_expected: FingerSchema,
    finger_actual: FingerSchema,
    key_distance: z
      .number()
      .nonnegative()
      .describe("Euclidean grid-unit distance between expected and actual keys.")
      .meta({
        dev: "Computed from x,y coords in qwerty.json: Math.sqrt((x1-x2)² + (y1-y2)²)",
        source: "qwerty.json → keys.row*[].x, keys.row*[].y",
      }),
    adjacent_key_slip: z
      .boolean()
      .describe("True when keys are direct physical neighbours.")
      .meta({ dev: "True when key_distance <= 1.0 and keys are not the same key" }),
    same_hand: z
      .boolean()
      .describe("Both keys struck by the same hand.")
      .meta({ dev: "Compared from qwerty.json hand field for both keys" }),
    same_finger: z
      .boolean()
      .describe("Both keys struck by the same finger.")
      .meta({ dev: "Compared from qwerty.json hand+finger fields. same_finger implies same_hand." }),
  })
  .describe("Keyboard-geometry detail for one expected→actual character pair.")
  .meta({ dev: "Reused in SequenceDetailsSchema.pairs[] for both substitution_sequence and transposition" });

const SubstitutionDetailsSchema = z
  .object({
    pairs: z
      .array(KeyPairDetailSchema)
      .min(1)
      .describe("One entry per substituted character. Length 1 for single-char, 2+ for consecutive sequence.")
      .meta({ dev: "Length matches char_index_end - char_index_start + 1" }),
  })
  .describe(
    "Substitution keyboard detail (single or sequence). " +
      "AI: for sequences, if all pairs share same_hand=true the user may be shifted one key over; " +
      "use key_distance and adjacent_key_slip to distinguish motor slips from cognitive confusion."
  )
  .meta({
    dev: "Always uses pairs[] — single-char substitutions have pairs.length === 1.",
    db_column: "word_error_events.details_jsonb",
  });

const TranspositionDetailsSchema = z
  .object({
    pairs: z
      .array(KeyPairDetailSchema)
      .length(2)
      .describe("Exactly 2 entries — the two swapped characters.")
      .meta({ dev: "pairs.length is always 2 for transposition" }),
  })
  .describe(
    "Transposition detail. AI: very common for cross-hand bigrams; if same_hand check finger ordering."
  )
  .meta({
    dev: "Used only by transposition. pairs.length is always 2.",
    db_column: "word_error_events.details_jsonb",
  });

const OmissionDetailsSchema = z
  .object({
    omitted_chars: z
      .array(
        z.object({
          expected: z
            .string()
            .min(1)
            .meta({ dev: "From target_word at the omitted index" }),
          keyboard_row_expected: KeyboardRowSchema,
          finger_expected: FingerSchema,
        })
      )
      .min(1)
      .describe("Each character that was skipped.")
      .meta({ dev: "Length matches char_index_end - char_index_start + 1" }),
    ended_by_space: z
      .boolean()
      .optional()
      .describe("True when user hit space before finishing the word.")
      .meta({ dev: "Set when the omission is at the end of the word and a space keystroke triggered word advance" }),
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
            .min(1)
            .meta({ dev: "Captured from raw keystroke that has no matching target char" }),
          keyboard_row_actual: KeyboardRowSchema,
          finger_actual: FingerSchema,
        })
      )
      .min(1)
      .describe("Each character that was inserted.")
      .meta({ dev: "Length matches actual_text.length on the parent event" }),
    trailing_insertion: z
      .boolean()
      .optional()
      .describe("True when extra characters appear after the last expected character.")
      .meta({ dev: "Set when char_index_start >= target_word.length (user typed past the word)" }),
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
      .describe("The character typed before the pause.")
      .meta({ dev: "Last keystroke char before the gap was detected" }),
    before_expected_char: z
      .string()
      .describe("The next expected character after the pause.")
      .meta({ dev: "From target_word at the position the user stalled on" }),
  })
  .describe(
    "Pause detail. AI: a pause between two chars from different hands is normal; " +
      "same-hand pauses suggest motor planning difficulty for that bigram."
  )
  .meta({
    dev: "The bigram (after_char + before_expected_char) is the transition the user hesitated on",
    db_column: "word_error_events.details_jsonb",
  });

const WordErrorEventBaseSchema = z.object({
  event_order: z
    .number()
    .int()
    .nonnegative()
    .describe("0-based ordering of events within the word attempt.")
    .meta({
      dev: "Incremented per event within a single word. Resets to 0 for each new word.",
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
      dev: "Tracked by monitoring if backspacing brings the word back to a correct state at the error position. Always null for pause events.",
      db_column: "word_error_events.corrected",
    }),
  char_index_start: z
    .number()
    .int()
    .nonnegative()
    .describe("0-based inclusive start index in the TARGET word.")
    .meta({
      dev: "Index into target_word (not raw input). For insertions this is the position where the extra char appears.",
      db_column: "word_error_events.char_index_start",
    }),
  char_index_end: z
    .number()
    .int()
    .nonnegative()
    .describe("0-based inclusive end index in the TARGET word.")
    .meta({
      dev: "Same as char_index_start for single-char events. For grouped events: start + (sequence_length - 1).",
      db_column: "word_error_events.char_index_end",
    }),
  position_in_word: PositionInWordSchema,
  expected_text: z
    .string()
    .describe(
      "The expected character(s) from the target word. Empty string for insertions."
    )
    .meta({
      dev: "target_word.slice(char_index_start, char_index_end + 1). Empty string '' for insertion events.",
      source: "word_mistakes.target_word",
      db_column: "word_error_events.expected_text",
    }),
  actual_text: z
    .string()
    .describe(
      "What the user actually typed. Empty string for omissions and pauses."
    )
    .meta({
      dev: "From raw input at error time. Empty string '' for omission and pause events.",
      db_column: "word_error_events.actual_text",
    }),
  pause_ms: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .describe("Milliseconds of hesitation. Only set for pause events; null otherwise.")
    .meta({
      dev: "Measured as delta between consecutive keystroke timestamps. null for non-pause events.",
      threshold: "Pause is registered when gap > 750 ms. Capped at 2000 ms for max_pause_ms aggregation.",
      db_column: "word_error_events.pause_ms",
    }),
  preceded_by_pause: z
    .boolean()
    .default(false)
    .describe("True if a pause event (>750 ms) immediately preceded this error.")
    .meta({
      dev: "Look at the previous event in event_order; if it was a pause, set true. Useful for AI to correlate hesitation with errors.",
      db_column: "word_error_events.preceded_by_pause",
    }),
});

export const SubstitutionEventSchema = WordErrorEventBaseSchema.extend({
  error_type: z.literal("substitution"),
  details_jsonb: SubstitutionDetailsSchema,
})
  .describe(
    "One or more consecutive wrong keys. " +
      "AI: for single-char, check adjacent_key_slip — true means motor slip; " +
      "for sequences, uniform key_distance across pairs suggests hand-shift, varied suggests distraction."
  )
  .meta({
    dev: "Covers both single and consecutive substitutions. pairs.length === char_index_end - char_index_start + 1.",
    example_single: "hello → hrllo (e→r, pairs.length=1)",
    example_sequence: "hello → hrroo (ell→rro, pairs.length=3)",
    db_table: "word_error_events",
  });

export const TranspositionEventSchema = WordErrorEventBaseSchema.extend({
  error_type: z.literal("transposition"),
  details_jsonb: TranspositionDetailsSchema,
})
  .describe(
    "Two adjacent characters were swapped (e.g. 'ei' → 'ie'). " +
      "AI: very common for cross-hand bigrams; if same_hand check finger ordering."
  )
  .meta({
    dev: "Always exactly 2 chars. pairs.length is always 2. Detected by comparing input[i]==target[i+1] && input[i+1]==target[i].",
    example: "their → thier (ei→ie)",
    db_table: "word_error_events",
  });

export const OmissionEventSchema = WordErrorEventBaseSchema.extend({
  error_type: z.literal("omission"),
  details_jsonb: OmissionDetailsSchema,
})
  .describe(
    "One or more expected characters were skipped. " +
      "AI: ended_by_space means the user hit space early; otherwise they may have mentally skipped a letter."
  )
  .meta({
    dev: "Can be single or grouped. actual_text is always ''. Check ended_by_space for early word-advance.",
    example_single: "hello → helo (l omitted)",
    example_grouped: "hello → heo (ll omitted)",
    example_space: "hello → hel (lo omitted, space pressed early)",
    db_table: "word_error_events",
  });

export const InsertionEventSchema = WordErrorEventBaseSchema.extend({
  error_type: z.literal("insertion"),
  details_jsonb: InsertionDetailsSchema,
})
  .describe(
    "One or more extra characters were typed that don't exist in the target. " +
      "AI: trailing_insertion is usually a stutter; mid-word insertion may indicate a habitual key sequence."
  )
  .meta({
    dev: "Can be single or grouped. expected_text is always ''. Check trailing_insertion for chars after word end.",
    example_single: "hello → helllo (extra l)",
    example_grouped: "hello → herlllo (extra rl)",
    example_trailing: "hello → hellooo (extra oo after word ends)",
    db_table: "word_error_events",
  });

export const PauseEventSchema = WordErrorEventBaseSchema.extend({
  error_type: z.literal("pause"),
  corrected: z.null(),
  details_jsonb: PauseDetailsSchema,
})
  .describe(
    "A hesitation > 750 ms between keystrokes (capped at 2 000 ms for max_pause_ms aggregation). " +
      "AI: frequent pauses on the same bigram across games signal a weak motor pattern worth drilling."
  )
  .meta({
    dev: "Not grouped — one event per pause. corrected is always null. pause_ms holds the actual gap duration.",
    threshold: "> 750 ms triggers a pause event. Pauses > 2000 ms are excluded from max_pause_ms in WordMistake and not counted as pause events.",
    example: "hello (1200 ms gap after 'h' before typing 'e')",
    db_table: "word_error_events",
  });

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
