import { z } from "zod";
import { WordErrorEventSchema } from "./word-error-event";

export const FinalStatusSchema = z
  .enum(["corrected", "incorrect", "skipped", "extra"])
  .describe(
    "Outcome of the word at game end. " +
      "corrected = was wrong then fixed; incorrect = still wrong; " +
      "skipped = user moved past without completing; extra = characters typed beyond the prompt."
  )
  .meta({
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
        db_column: "word_mistakes.words_reached_at_end",
      }),

    target_word: z
      .string()
      .min(1)
      .describe("The full correct word from the prompt.")
      .meta({
        db_column: "word_mistakes.target_word",
      }),

    final_word: z
      .string()
      .describe(
        "What the user had written for this word when the game ended (may be empty if skipped)."
      )
      .meta({
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
        db_column: "word_mistakes.backspace_count",
      }),

    word_length: z
      .number()
      .int()
      .positive()
      .describe("Character count of the target word.")
      .meta({
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
        db_column: "word_mistakes.error_count",
      }),

    word_error_events: z
      .array(WordErrorEventSchema)
      .default([])
      .describe(
        "Ordered list of individual error/pause events for this word. " +
          "AI: iterate to find recurring error_type patterns on specific char positions."
      ),
  })
  .describe(
    "Aggregated telemetry for one word within a typing game. " +
      "AI: use final_status + correction_count + error_count to classify difficulty; " +
      "drill into word_error_events for root-cause analysis."
  );

export const WordMistakeBatchSchema = z
  .object({
    typing_result_id: z
      .number()
      .int()
      .positive()
      .describe("FK to typing_results.id - the game session these mistakes belong to.")
      .meta({
        db_column: "word_mistakes.typing_result_id",
      }),

    word_mistakes: z
      .array(WordMistakeSchema)
      .min(1)
      .describe("All word-level mistake records for this game session."),
  })
  .describe(
    "Payload sent from the client after a game ends. " +
      "Server validates with this schema, then writes to word_mistakes + word_error_events tables."
  );

export type WordMistake = z.infer<typeof WordMistakeSchema>;
export type WordMistakeBatch = z.infer<typeof WordMistakeBatchSchema>;
export type FinalStatus = z.infer<typeof FinalStatusSchema>;
