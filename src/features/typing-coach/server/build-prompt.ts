import "server-only";

import type { TypingCoachAIAggregate, TypingCoachAIInput } from "../schemas/ai-aggregate";

export function aggregateJsonForPrompt(
  aggregate: TypingCoachAIAggregate
): Omit<TypingCoachAIAggregate, "top_words" | "top_error_patterns"> {
  const rest: Partial<TypingCoachAIAggregate> = { ...aggregate };
  delete rest.top_words;
  delete rest.top_error_patterns;
  return rest as Omit<TypingCoachAIAggregate, "top_words" | "top_error_patterns">;
}

const SYSTEM_PROMPT = `You are an expert typing coach for ANSI QWERTY touch typing (home row, standard finger assignments).

You receive structured telemetry only (aggregates, error patterns, per-word stats, and optional keyboard geometry on events). Infer likely physical causes (finger, row, reach, same-hand vs cross-hand, adjacent-key slips) ONLY when the data supports it — do not invent patterns.

Output strict JSON only. No markdown, no code fences. The JSON must match the schema: an "items" array. Each element is ONE distinct weakness.

Quality over quantity:
- Return as many items as are genuinely distinct and evidence-backed (the schema allows up to a capped maximum). Prefer fewer strong items over many weak ones.
- If two weaknesses overlap, merge them into one item.
- If the evidence is thin, output fewer items or a single item — never pad with generic advice.

Per item:
- "feedback": exactly 2–3 sentences:
  - Sentence 1: State the specific weakness using concrete evidence — exact characters, sequences, positions in words, error types (substitution, omission, transposition, insertion, pause), or named transitions. Quote short examples from the data when present (e.g. expected vs actual).
  - Sentence 2: Explain the likely typing behaviour or QWERTY/touch-typing cause when supportable (e.g. weak pinky on 'a', stretch from middle to column, confusion between adjacent keys, cross-hand transition, end-of-word omission). If pauses appear in the data, tie them to a specific character or transition (e.g. "pause before typing 'e' after 'h'"), never vague "you pause a lot".
  - Sentence 3: One concrete correction — drill, focus rule, or repeatable practice approach tied to that weakness.
- "practice_words": about 30–50 words for THAT weakness only (not shared across items). Lowercase English; each token is letters a–z with optional internal apostrophes for real contractions (e.g. don't, it's, couldn't). No other punctuation, no spaces inside a word.

Banned vague phrases (do not use): "you pause a lot", "practice more" without a drill, "you make many mistakes", motivational fluff, greetings, emojis, exclamation marks.

Assume the typist aims for standard touch typing — not hunt-and-peck.`;

export type TypingCoachPromptMessages = {
  system: string;
  user: string;
};

export function buildTypingCoachPrompt(input: TypingCoachAIInput): TypingCoachPromptMessages {
  const user = `AGGREGATE_JSON summarises recent typing performance for this user (see field descriptions in the codebase: WordMistake / WordErrorEvent telemetry).

How to interpret it:
- "words": PRIMARY source — each entry is one target_word with final_variants, stats, and "word_error_events" (aggregated error signatures and counts for that word). Prefer weaknesses backed by high counts and clear expected vs actual pairs.
- Pause-related signals: only surface a pause weakness if you can tie it to a specific transition, character index, or before/after pair from the data — never generic hesitation advice.
- Where error events include keyboard_row / finger / key_distance / adjacent_key_slip / same_hand: you may mention likely QWERTY finger or row issues; omit finger claims if geometry is missing for that event.
- "contains_focus_bigram" / "contains_focus_trigram" on words: rare n-grams — useful context when explaining sequence difficulty.
- Produce only distinct, worthwhile weaknesses; omit items that restate the same issue.

Return JSON with "items": [ ... ]. Each item must have "feedback" (2–3 sentences as above) and "practice_words" (dedicated list for that item only).

AGGREGATE_JSON:
${JSON.stringify(aggregateJsonForPrompt(input.aggregate))}`;

  return { system: SYSTEM_PROMPT, user };
}
