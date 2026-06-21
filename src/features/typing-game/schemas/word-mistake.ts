import { z } from "zod";
import { WordErrorEventSchema } from "./word-error-event";

// WordMistake is the validated structure for one word's typing analytics. It
// combines final word status, timing, corrections, pauses and nested error events.
export const FinalStatusSchema = z
  .enum(["corrected", "incorrect", "skipped", "extra"])
  .describe(
    "Outcome of the word at game end. " +
      "corrected = was wrong then fixed; incorrect = still wrong; " +
      "skipped = user moved past without completing; extra = characters typed beyond the prompt."
  )
  .meta({
    dev: "Derived by comparing final_word against target_word at game-end snapshot",
    db_column: "word_mistakes.final_status",
  });

export const WordMistakeSchema = z
  .object({
    word_index: z
      .number()
      .int()
      .nonnegative()
      .describe("0-based position of the word in the prompt (first word = 0).")
      .meta({
        dev: "Index from displayText.split(' '). Stays stable even if user backtracks.",
        db_column: "word_mistakes.word_index",
      }),

    words_reached_at_end: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe(
        "The highest word index the user touched during this game. " +
          "AI: compare with word_index to see how far past this word the user got."
      )
      .meta({
        dev: "Set once at game end. Same value for every WordMistake in the same game — max word_index touched.",
        db_column: "word_mistakes.words_reached_at_end",
      }),

    target_word: z
      .string()
      .min(1)
      .describe("The full correct word from the prompt.")
      .meta({
        dev: "displayText.split(' ')[word_index]. Immutable once generated.",
        source: "typing-game prompt generator (lib/prompt.ts)",
        db_column: "word_mistakes.target_word",
      }),

    final_word: z
      .string()
      .describe(
        "What the user had written for this word when the game ended (may be empty if skipped)."
      )
      .meta({
        dev: "Snapshot of the user's input for this word position at game-end. Empty string if never reached.",
        db_column: "word_mistakes.final_word",
      }),

    final_status: FinalStatusSchema,

    correction_count: z
      .number()
      .int()
      .nonnegative()
      .default(0)
      .describe(
        "How many times the word transitioned from an incorrect state back to correct via backspace. " +
          "AI: high correction_count on short words may indicate motor uncertainty rather than ignorance."
      )
      .meta({
        dev: "Incremented each time: word goes incorrect → user backspaces → word becomes correct again. Partial/extra states count as incorrect.",
        db_column: "word_mistakes.correction_count",
      }),

    backspace_count: z
      .number()
      .int()
      .nonnegative()
      .default(0)
      .describe(
        "Total backspaces within this word. If the user pressed Enter to advance then backspaced " +
          "to return, that backspace counts for the previous word."
      )
      .meta({
        dev: "Tracked per-word. If user hits Enter on word N then backspaces, that backspace increments word N-1's count, not word N's.",
        db_column: "word_mistakes.backspace_count",
      }),

    word_length: z
      .number()
      .int()
      .positive()
      .describe("Character count of the target word.")
      .meta({
        dev: "target_word.length. Useful for normalising error_count and duration_ms.",
        db_column: "word_mistakes.word_length",
      }),

    contains_repeat_pattern: z
      .boolean()
      .default(false)
      .describe(
        "True if the target word has double consecutive letters (e.g. 'll' in 'hello') " +
          "or a repeated sub-pattern (e.g. 'ana' in 'banana'). " +
          "AI: repeat patterns often cause insertion or omission errors."
      )
      .meta({
        dev: "Use a utils function: check for consecutive duplicate chars OR any substring of length >= 2 that appears more than once.",
        derivation: "Computed from target_word only — no user input needed.",
        db_column: "word_mistakes.contains_repeat_pattern",
      }),

    contains_focus_bigram: z
      .boolean()
      .default(false)
      .describe(
        "True if the target word (length > 2) contains at least one bigram from " +
          "english_focus_bigrams.json (frequency band 0.1%–0.6% of all bigrams). " +
          "AI: focus bigrams are uncommon enough to be error-prone but common enough to be worth drilling."
      )
      .meta({
        dev: "Skip if target_word.length <= 2 (word itself is a bigram). Iterate all bigrams in target_word, look up in english_focus_bigrams.json set.",
        source: "src/data/languages/english/english_focus_bigrams.json",
        db_column: "word_mistakes.contains_focus_bigram",
      }),

    contains_focus_trigram: z
      .boolean()
      .default(false)
      .describe(
        "True if the target word (length > 3) contains at least one trigram from " +
          "english_focus_trigrams.json (frequency band 0.05%–0.12%). " +
          "AI: focus trigrams indicate rare finger sequences that benefit from targeted practice."
      )
      .meta({
        dev: "Skip if target_word.length <= 3 (word itself is a trigram). Iterate all trigrams in target_word, look up in english_focus_trigrams.json set.",
        source: "src/data/languages/english/english_focus_trigrams.json",
        db_column: "word_mistakes.contains_focus_trigram",
      }),

    start_time_ms: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe(
        "Timestamp (ms since game start) when the first character was typed. " +
          "Reset if the user fully clears the word and has no characters remaining for it."
      )
      .meta({
        dev: "performance.now() delta from game start. Overwrite if the user backspaces all chars for this word and starts re-typing.",
        db_column: "word_mistakes.start_time_ms",
      }),

    end_time_ms: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe(
        "Timestamp (ms since game start) when the user pressed space/Enter to leave the word. " +
          "If the user backspaces to this word and leaves again, this updates to the later time. " +
          "For the last word it is when the final character completes the game."
      )
      .meta({
        dev: "Updated every time the user exits this word (space/Enter or game end). Always reflects the latest departure.",
        db_column: "word_mistakes.end_time_ms",
      }),

    duration_ms: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe(
        "end_time_ms − start_time_ms. " +
          "AI: compare duration_ms / word_length across sessions to spot slow bigrams."
      )
      .meta({
        dev: "Computed at game end: end_time_ms - start_time_ms. null if either timestamp is null.",
        derivation: "end_time_ms - start_time_ms",
        db_column: "word_mistakes.duration_ms",
      }),

    pause_count: z
      .number()
      .int()
      .nonnegative()
      .default(0)
      .describe(
        "Number of inter-keystroke gaps > 750 ms within this word. " +
          "AI: multiple pauses in a short word suggest the user is visually searching for keys."
      )
      .meta({
        dev: "Count of pause-type WordErrorEvents for this word. Matches word_error_events.filter(e => e.error_type === 'pause').length.",
        threshold: "> 750 ms between consecutive keystrokes",
        db_column: "word_mistakes.pause_count",
      }),

    max_pause_ms: z
      .number()
      .int()
      .nonnegative()
      .default(0)
      .describe(
        "Longest single pause (ms) within this word, ignoring any pause > 2 000 ms " +
          "(those are likely distractions, not motor difficulty)."
      )
      .meta({
        dev: "Max of pause_ms values where pause_ms <= 2000. Pauses > 2000 ms are excluded (likely AFK / distraction).",
        threshold: "Excluded if > 2000 ms",
        db_column: "word_mistakes.max_pause_ms",
      }),

    error_count: z
      .number()
      .int()
      .nonnegative()
      .default(0)
      .describe(
        "Total WordErrorEvents registered for this word in this game. " +
          "AI: error_count / word_length gives a normalised difficulty score."
      )
      .meta({
        dev: "word_error_events.length for this word (includes pauses). Kept denormalised for fast queries.",
        db_column: "word_mistakes.error_count",
      }),

    word_error_events: z
      .array(WordErrorEventSchema)
      .default([])
      .describe(
        "Ordered list of individual error/pause events for this word. " +
          "AI: iterate to find recurring error_type patterns on specific char positions."
      )
      .meta({
        dev: "Nested in the client payload; server writes to word_error_events table with FK to word_mistakes.word_id.",
        db_table: "word_error_events",
        db_fk: "word_error_events.word_mistake_id → word_mistakes.word_id",
      }),
  })
  .describe(
    "Aggregated telemetry for one word within a typing game. " +
      "AI: use final_status + correction_count + error_count to classify difficulty; " +
      "drill into word_error_events for root-cause analysis."
  )
  .meta({
    dev: "One record per word in the prompt that the user interacted with (or should have). Words with zero errors can be omitted from the payload.",
    db_table: "word_mistakes",
    db_pk: "word_mistakes.word_id",
    db_fk: "word_mistakes.typing_result_id → typing_results.id",
  });

export const WordMistakeBatchSchema = z
  .object({
    // The batch links all word mistakes to the saved typing result row.
    typing_result_id: z
      .number()
      .int()
      .positive()
      .describe("FK to typing_results.id — the game session these mistakes belong to.")
      .meta({
        dev: "Must reference an existing typing_results row. Obtained from the save-typing-result server action response.",
        db_column: "word_mistakes.typing_result_id",
        source: "save-typing-result return value",
      }),

    word_mistakes: z
      .array(WordMistakeSchema)
      .min(1)
      .describe("All word-level mistake records for this game session.")
      .meta({
        dev: "Only include words that had at least one error or non-trivial event. Order by word_index ascending.",
      }),
  })
  .describe(
    "Payload sent from the client after a game ends. " +
      "Server validates with this schema, then writes to word_mistakes + word_error_events tables."
  )
  .meta({
    dev: "Used in the API route / server action that persists telemetry. Call WordMistakeBatchSchema.parse(body) on the raw request body.",
    endpoint: "POST /api/typing/word-mistakes or server action",
    writes_to: ["word_mistakes", "word_error_events"],
  });

export type WordMistake = z.infer<typeof WordMistakeSchema>;
export type WordMistakeBatch = z.infer<typeof WordMistakeBatchSchema>;
export type FinalStatus = z.infer<typeof FinalStatusSchema>;
