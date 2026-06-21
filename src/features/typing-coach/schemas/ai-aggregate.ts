import { z } from "zod";
import { FinalStatusSchema } from "@/features/typing-game/schemas/word-mistake";
import {
  ErrorTypeSchema,
  PositionInWordSchema,
} from "@/features/typing-game/schemas/word-error-event";

// These Zod schemas describe the structured telemetry JSON prepared for the AI
// coach. The server validates the aggregate before it is inserted into a prompt.
export const PositionBucketCountsSchema = z
  .object({
    start_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Count of word records whose word_index falls in the start segment.")
      .meta({
        dev: "Derived from word_index and words_reached_at_end bucketing.",
      }),
    middle_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Count of word records whose word_index falls in the middle segment.")
      .meta({
        dev: "Derived from word_index and words_reached_at_end bucketing.",
      }),
    end_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Count of word records whose word_index falls in the end segment.")
      .meta({
        dev: "Derived from word_index and words_reached_at_end bucketing.",
      }),
    total_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Total records considered for start/middle/end positional buckets.")
      .meta({
        dev: "Usually start_count + middle_count + end_count.",
      }),
  })
  .describe("Positional distribution of attempted words across the prompt.")
  .meta({
    source_fields: ["word_index", "words_reached_at_end"],
  });

export const FinalWordVariantSchema = z
  .object({
    final_word: z
      .string()
      .describe("Observed final_word variant for a given target_word.")
      .meta({
        source_field: "final_word",
      }),
    count: z
      .number()
      .int()
      .nonnegative()
      .describe("How many times this final_word variant occurred for the same target_word.")
      .meta({
        dev: "Frequency count inside one target_word aggregate.",
      }),
  })
  .describe("One observed final_word variant and its frequency.")
  .meta({
    grouping: "group by target_word + final_word",
  });

export const TargetWordAggregateSchema = z
  .object({
    target_word: z
      .string()
      .min(1)
      .describe("Canonical prompt word being aggregated.")
      .meta({
        source_field: "target_word",
      }),
    total_attempts: z
      .number()
      .int()
      .nonnegative()
      .describe("Total attempts logged for this target_word across the aggregate window.")
      .meta({
        dev: "Count of word_mistake rows with the same target_word.",
      }),
    final_variants: z
      .array(FinalWordVariantSchema)
      .default([])
      .describe("Distribution of final_word outcomes for this target_word.")
      .meta({
        dev: "Useful for confusion patterns and custom drill generation.",
      }),
  })
  .describe("Aggregate view of one target_word and its observed typed outcomes.")
  .meta({
    source_field: "target_word",
  });

export const FinalStatusCountsSchema = z
  .object({
    corrected_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Count of words with final_status='corrected'."),
    incorrect_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Count of words with final_status='incorrect'."),
    skipped_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Count of words with final_status='skipped'."),
    extra_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Count of words with final_status='extra'."),
    total_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Total rows used to compute final status distribution."),
  })
  .describe("Count summary by final_status categories.")
  .meta({
    source_field: "final_status",
    enum: FinalStatusSchema.options,
  });

export const CountAndMeanSchema = z
  .object({
    total: z
      .number()
      .int()
      .nonnegative()
      .describe("Summed total across all included records."),
    mean: z
      .number()
      .nonnegative()
      .describe("Arithmetic mean across included records."),
  })
  .describe("Generic numeric aggregate with total and mean.")
  .meta({
    dev: "Used for correction/backspace summaries.",
  });

export const MaxPauseSummarySchema = z
  .object({
    mean_max_pause_ms: z
      .number()
      .nonnegative()
      .describe("Average of per-word max_pause_ms values."),
    global_max_pause_ms: z
      .number()
      .int()
      .nonnegative()
      .describe("Single highest max_pause_ms value observed in the aggregate window."),
  })
  .describe("Pause intensity summary using both typical and worst-case metrics.")
  .meta({
    source_field: "max_pause_ms",
    threshold: "Per-word max_pause_ms already excludes pauses > 2000ms upstream.",
  });

export const AggregatedErrorEventSchema = z
  .object({
    error_type: ErrorTypeSchema.describe(
      "Kind of typing error. substitution = wrong character(s) typed; transposition = adjacent chars swapped; omission = expected char missed; insertion = extra char typed; pause = hesitation/thinking gap (no wrong char)."
    ),
    char_index_start: z
      .number()
      .int()
      .nonnegative()
      .describe("0-based start index inside the target word where the error occurs."),
    char_index_end: z
      .number()
      .int()
      .nonnegative()
      .describe("0-based end index (inclusive) inside the target word where the error occurs."),
    position_in_word: PositionInWordSchema.describe(
      "Where in the word the error occurs (start | middle | end | whole)."
    ),
    expected_text: z
      .string()
      .describe("Substring from the prompt at [char_index_start, char_index_end] that the user was supposed to type."),
    actual_text: z
      .string()
      .describe("What the user actually typed at that position (empty string for omission/pause)."),
    count: z
      .number()
      .int()
      .nonnegative()
      .describe("How many events matched this aggregation key."),
    corrected_true_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Among grouped rows, count where corrected === true."),
    corrected_false_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Among grouped rows, count where corrected === false."),
    corrected_null_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Among grouped rows, count where corrected === null."),
    preceded_by_pause_true_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Among grouped rows, count where preceded_by_pause === true."),
    preceded_by_pause_false_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Among grouped rows, count where preceded_by_pause === false."),
    pause_ms_mean: z
      .number()
      .nonnegative()
      .nullable()
      .optional()
      .describe("Mean pause_ms for grouped rows (typically relevant for pause error_type).")
      .meta({
        dev: "Null when no pause_ms values exist for this grouped key.",
      }),
    details_jsonb: z
      .unknown()
      .nullable()
      .optional()
      .describe("Representative details_jsonb for the grouped error key.")
      .meta({
        dev: "Assumes details_jsonb is stable for this key. If not stable, switch to variant list with counts.",
      }),
  })
  .describe("Aggregated error-event signature and counters for AI pattern analysis.")
  .meta({
    grouping_key: [
      "error_type",
      "char_index_start",
      "char_index_end",
      "expected_text",
      "actual_text",
    ],
    dropped_fields: ["event_order"],
  });

export const ErrorTypeCountsSchema = z
  .object({
    substitution_count: z.number().int().nonnegative().describe("Total substitution events."),
    transposition_count: z.number().int().nonnegative().describe("Total transposition events."),
    omission_count: z.number().int().nonnegative().describe("Total omission events."),
    insertion_count: z.number().int().nonnegative().describe("Total insertion events."),
    pause_count: z.number().int().nonnegative().describe("Total pause events."),
    total_count: z.number().int().nonnegative().describe("Total events across all error types."),
  })
  .describe("Optional fast summary of event totals by error_type.")
  .meta({
    source_field: "word_error_events.error_type",
  });

export const TypingCoachAIHistorySchema = z
  .object({
    session_cap: z
      .number()
      .int()
      .positive()
      .describe("Max recent sessions considered (intersected with the time window)."),
    window_days: z
      .number()
      .int()
      .positive()
      .describe("Days back from now for the time window."),
    effective_session_count: z
      .number()
      .int()
      .nonnegative()
      .describe(
        "Sessions included after applying: among the session_cap most recent ended sessions, keep those within window_days."
      ),
  })
  .describe("Explains which typing sessions fed this aggregate (AI-sized history).");

export const TypingCoachAIWordAggregateSchema = z
  .object({
    word_position_buckets: PositionBucketCountsSchema,
    target_word: z.string().min(1).describe("Target word for this per-word aggregate."),
    final_variants: z
      .array(FinalWordVariantSchema)
      .default([])
      .describe("Observed final_word variants and their counts for this target_word."),
    final_status_counts: FinalStatusCountsSchema,
    correction: CountAndMeanSchema,
    backspace: CountAndMeanSchema,
    word_length: z.number().int().positive().describe("Length of target_word."),
    contains_repeat_pattern: z.boolean().describe("Repeat-pattern flag for target_word."),
    contains_focus_bigram: z.boolean().describe("Focus-bigram flag for target_word."),
    contains_focus_trigram: z.boolean().describe("Focus-trigram flag for target_word."),
    duration_ms: z.object({
      mean: z.number().nonnegative(),
    }),
    max_pause_ms: MaxPauseSummarySchema,
    error_count: z.object({
      total: z.number().int().nonnegative(),
    }),
    word_error_events: z
      .array(AggregatedErrorEventSchema)
      .default([])
      .describe("Per-word aggregated error-event patterns."),
    error_type_counts: ErrorTypeCountsSchema.optional(),
  })
  .describe("Per-target-word aggregate payload used by typing coach AI.");

export const TypingCoachAITopWordSchema = TypingCoachAIWordAggregateSchema.extend({
  // Temporary ranking value used by aggregation to choose the hardest words.
  // It is not needed by the LLM-facing `words` list.
  difficulty_score: z
    .number()
    .describe(
      "Heuristic rank: error_count.total + incorrect_count*2 + error_type_counts.pause_count*0.5 + correction.total*0.5"
    ),
});

export const TypingCoachAIAggregateSchema = z
  .object({
    // Full aggregate object built from word_mistakes and word_error_events.
    // This is structured data, not raw keystroke text.
    user_id: z
      .string()
      .min(1)
      .describe("User identifier that this aggregate belongs to.")
      .meta({
        dev: "Typically Clerk user_id / subject used in typing_results.",
      }),
    window_days: z
      .number()
      .int()
      .positive()
      .describe("Rolling lookback in days: include games from the last N days (minimum 1)."),
    history: TypingCoachAIHistorySchema.describe(
      "Which recent sessions fed this aggregate (session cap intersected with window_days)."
    ),
    session_count: z
      .number()
      .int()
      .nonnegative()
      .describe("How many typing sessions were aggregated."),
    word_count: z
      .number()
      .int()
      .nonnegative()
      .describe(
        "Total word_mistakes rows represented in words/top_words (attempts summed for included targets only)."
      ),
    distinct_word_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Number of distinct target words in words/top_words (same as len(words))."),
    words: z
      .array(TypingCoachAIWordAggregateSchema)
      .default([])
      .describe(
        "Per-word aggregates for the words to focus on. Includes the hardest words by difficulty_score plus extras whose errors match top_error_patterns. Each entry contains every aggregated error event (substitutions, transpositions, omissions, insertions, pauses) for that target word."
      ),
    top_words: z
      .array(TypingCoachAITopWordSchema)
      .default([])
      .describe(
        "Same entries as `words` but with `difficulty_score` attached. Higher score = harder word for this user. Use this list to identify which words are most painful right now."
      ),
    top_error_patterns: z
      .array(AggregatedErrorEventSchema)
      .default([])
      .describe(
        "Most common non-pause error signatures across recent games (ranked by `count`, pause excluded). Char indices are 0-based on the target word; `expected_text` is what the prompt asked for and `actual_text` is what the user typed. Use this to detect cross-word patterns (e.g. 's' often substituted for 'a' near word end)."
      ),
    generated_at: z
      .string()
      .datetime()
      .optional()
      .describe("ISO timestamp when this aggregate payload was generated."),
  })
  .describe(
    "Aggregated typing telemetry for the typing coach AI. All counts are summaries across recent typing sessions, NOT raw keystroke streams. Use this to identify ONE concrete weakness to focus on (look at top_error_patterns, top_words by difficulty_score, and per-word error events). Char indices in error events are 0-based on the target word."
  )
  .meta({
    source_tables: ["word_mistakes", "word_error_events"],
    consumer: "typing coach feedback and practice-word generation",
  });

export const TypingCoachAIInputSchema = z
  .object({
    // Top-level wrapper passed into prompt building and model generation.
    aggregate: TypingCoachAIAggregateSchema.describe("Structured aggregated telemetry input."),
  })
  .describe("Top-level payload sent to the typing coach AI prompt builder.")
  .meta({
    dev: "Validate this before prompt construction and model invocation.",
  });

export type FinalStatus = z.infer<typeof FinalStatusSchema>;
export type TypingCoachAIAggregate = z.infer<typeof TypingCoachAIAggregateSchema>;
export type TypingCoachAIInput = z.infer<typeof TypingCoachAIInputSchema>;
