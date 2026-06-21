import { z } from "zod";

const WORD_PER_ITEM_TARGET_MIN = 28;
const WORD_PER_ITEM_TARGET_MAX = 52;
const WORD_PER_ITEM_STORE_MAX = 50;

const MAX_WEAKNESSES = 8;

const PRACTICE_WORD_REGEX = /^[a-z]+(?:'[a-z]+)*$/;

// Stored practice words must be simple prompt-safe tokens.
const practiceWordStoredSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(PRACTICE_WORD_REGEX)
  .describe(
    "One practice word: lowercase a–z, optional internal apostrophes for valid English contractions. No spaces or other punctuation."
  )
  .meta({
    dev: "JSON array in TypingCoachAiFeedbackItem.practice_words. Apostrophe is ASCII U+0027.",
  });

function normalizePracticeToken(raw: string): string | null {
  // Clean model-generated practice words before saving. Invalid tokens are
  // dropped instead of being stored.
  const trimmed = raw.trim().toLowerCase();
  const w = trimmed.replace(/[^a-z']/g, "");
  if (w.length === 0) return null;
  if (!PRACTICE_WORD_REGEX.test(w)) return null;
  return w;
}

export const TypingCoachAIOutputSchema = z.object({
  // Final stored output shape. This is the safe version after normalisation.
  items: z
    .array(
      z.object({
        feedback: z.string().min(1),
        practice_words: z
          .array(practiceWordStoredSchema)
          .min(1)
          .max(WORD_PER_ITEM_STORE_MAX),
      })
    )
    .min(1)
    .max(MAX_WEAKNESSES),
});

export type TypingCoachAIOutput = z.infer<typeof TypingCoachAIOutputSchema>;

const typingCoachItemGenerateSchema = z
  .object({
    // Schema used directly with generateObject(). It is stricter and more
    // descriptive because it guides the model output.
    feedback: z
      .string()
      .min(80)
      .max(4000)
      .describe(
        "Exactly 2–3 sentences. Sentence 1: name the weakness with concrete evidence (exact chars, sequences, positions, or pause tied to a specific transition). " +
          "Sentence 2: likely QWERTY touch-typing cause when inferable (finger, row, reach, same-hand, adjacent slip). " +
          "Sentence 3: one concrete correction strategy or drill. No vague 'you pause a lot', no generic 'practice more', no emojis or hype."
      )
      .meta({
        dev: "Shown in UI; streamed in hover card. Must cite specifics from aggregate telemetry when possible.",
      }),
    practice_words: z
      .array(
        z
          .string()
          .min(1)
          .max(48)
          .describe(
            "Lowercase word; letters a–z and optional internal apostrophes only (e.g. don't, it's). One token, no spaces."
          )
      )
      .min(WORD_PER_ITEM_TARGET_MIN)
      .max(WORD_PER_ITEM_TARGET_MAX)
      .describe(
        `About 30–50 practice words for THIS weakness only — not shared with other items. Target ${WORD_PER_ITEM_TARGET_MIN}–${WORD_PER_ITEM_TARGET_MAX} entries before normalization.`
      )
      .meta({
        dev: "Per-item pool mixed into prompts with coachMixProbability in use-typing-game.",
      }),
  })
  .describe(
    "One distinct, evidence-backed weakness. Omit items that would duplicate or lack support in the aggregate."
  )
  .meta({
    coach: "Prefer fewer strong items over many weak ones; only as many items as are genuinely distinct.",
  });

export const TypingCoachAIGenerateSchema = z
  .object({
    items: z
      .array(typingCoachItemGenerateSchema)
      .min(1)
      .max(MAX_WEAKNESSES)
      .describe(
        `Ordered list of coaching items (1–${MAX_WEAKNESSES}). Count is not fixed — return only weaknesses clearly supported by telemetry. Fewer is fine; more only when clearly distinct and useful.`
      )
      .meta({
        dev: "Passed to generateObject(). Each item maps to one TypingCoachAiFeedback row.",
      }),
  })
  .describe(
    "Typing coach structured output: distinct weaknesses, each with feedback + dedicated practice_words list."
  )
  .meta({
    product: "Typing Coach AI",
    keyboard: "Assume ANSI QWERTY touch typing (home row, finger assignments) when inferring causes.",
  });

export type TypingCoachAIGenerate = z.infer<typeof TypingCoachAIGenerateSchema>;

function normalizeItemWords(raw: string[]): string[] {
  // Normalise, deduplicate and cap practice words for one feedback item.
  const words: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const n = normalizePracticeToken(r);
    if (n && !seen.has(n)) {
      seen.add(n);
      words.push(n);
    }
  }
  return words.slice(0, WORD_PER_ITEM_STORE_MAX);
}

export function generatedToStoredOutput(gen: TypingCoachAIGenerate): TypingCoachAIOutput {
  // Convert the raw generated schema into the smaller stored schema.
  const items: TypingCoachAIOutput["items"] = [];

  for (const block of gen.items) {
    // Trim feedback and skip empty blocks.
    const feedback = block.feedback.trim();
    if (feedback.length < 1) continue;

    // Clean practice words and skip blocks that have no usable practice tokens.
    const practice_words = normalizeItemWords(block.practice_words);
    if (practice_words.length < 1) continue;

    items.push({ feedback, practice_words });
  }

  if (items.length === 0) {
    // If all generated items were invalid, fail the run instead of saving empty
    // feedback.
    throw new Error("No valid coaching items after normalisation");
  }

  // Final parse guarantees the returned object matches the database/UI shape.
  return TypingCoachAIOutputSchema.parse({ items });
}

export function pairFeedbackWithPracticeWords(output: TypingCoachAIOutput): {
  feedback: string;
  practice_words: string[];
}[] {
  // Convenience helper that keeps feedback text paired with its own practice
  // word list.
  return output.items.map((row) => ({
    feedback: row.feedback,
    practice_words: row.practice_words,
  }));
}

export function flattenCoachPracticeWords(output: TypingCoachAIOutput): string[] {
  // Merge all item practice words into one deduplicated list.
  return [...new Set(output.items.flatMap((i) => i.practice_words))];
}

export function flattenCoachItemsPracticeWords(
  items: { practice_words: string[] }[]
): string[] {
  // Same flattening helper for already-loaded database feedback items.
  return [...new Set(items.flatMap((i) => i.practice_words))];
}
