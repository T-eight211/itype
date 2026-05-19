import { z } from "zod";

const WORD_PER_ITEM_TARGET_MIN = 28;
const WORD_PER_ITEM_TARGET_MAX = 52;
const WORD_PER_ITEM_STORE_MAX = 50;

const MAX_WEAKNESSES = 8;

const PRACTICE_WORD_REGEX = /^[a-z]+(?:'[a-z]+)*$/;

const practiceWordStoredSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(PRACTICE_WORD_REGEX)
  .describe(
    "One practice word: lowercase a–z, optional internal apostrophes for valid English contractions. No spaces or other punctuation."
  );

function normalizePracticeToken(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  const w = trimmed.replace(/[^a-z']/g, "");
  if (w.length === 0) return null;
  if (!PRACTICE_WORD_REGEX.test(w)) return null;
  return w;
}

export const TypingCoachAIOutputSchema = z.object({
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
    feedback: z
      .string()
      .min(80)
      .max(4000)
      .describe(
        "Exactly 2–3 sentences. Sentence 1: name the weakness with concrete evidence (exact chars, sequences, positions, or pause tied to a specific transition). " +
          "Sentence 2: likely QWERTY touch-typing cause when inferable (finger, row, reach, same-hand, adjacent slip). " +
          "Sentence 3: one concrete correction strategy or drill. No vague 'you pause a lot', no generic 'practice more', no emojis or hype."
      ),
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
        `About 30–50 practice words for THIS weakness only - not shared with other items. Target ${WORD_PER_ITEM_TARGET_MIN}–${WORD_PER_ITEM_TARGET_MAX} entries before normalization.`
      ),
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
        `Ordered list of coaching items (1-${MAX_WEAKNESSES}). Count is not fixed - return only weaknesses clearly supported by telemetry. Fewer is fine; more only when clearly distinct and useful.`
      ),
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
  const items: TypingCoachAIOutput["items"] = [];

  for (const block of gen.items) {
    const feedback = block.feedback.trim();
    if (feedback.length < 1) continue;

    const practice_words = normalizeItemWords(block.practice_words);
    if (practice_words.length < 1) continue;

    items.push({ feedback, practice_words });
  }

  if (items.length === 0) {
    throw new Error("No valid coaching items after normalisation");
  }

  return TypingCoachAIOutputSchema.parse({ items });
}

export function pairFeedbackWithPracticeWords(output: TypingCoachAIOutput): {
  feedback: string;
  practice_words: string[];
}[] {
  return output.items.map((row) => ({
    feedback: row.feedback,
    practice_words: row.practice_words,
  }));
}

export function flattenCoachPracticeWords(output: TypingCoachAIOutput): string[] {
  return [...new Set(output.items.flatMap((i) => i.practice_words))];
}

export function flattenCoachItemsPracticeWords(
  items: { practice_words: string[] }[]
): string[] {
  return [...new Set(items.flatMap((i) => i.practice_words))];
}
