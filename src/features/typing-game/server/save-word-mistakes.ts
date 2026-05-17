"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { WordMistakeBatchSchema } from "../schemas/word-mistake";

export async function saveWordMistakes(raw: unknown) {
  const { userId } = await auth();
  if (!userId) return { error: "Not signed in" };

  const parsed = WordMistakeBatchSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("saveWordMistakes validation error:", parsed.error.flatten());
    return { error: "Invalid payload" };
  }

  const { typing_result_id, word_mistakes } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.typingResults.findFirst({
        where: { id: typing_result_id, user_id: userId },
        select: { id: true },
      });

      if (!result) {
        throw new Error("Typing result not found or not owned by user");
      }

      for (const wm of word_mistakes) {
        const createdMistake = await tx.wordMistake.create({
          data: {
            typing_result_id,
            word_index: wm.word_index,
            words_reached_at_end: wm.words_reached_at_end,
            target_word: wm.target_word,
            final_word: wm.final_word,
            final_status: wm.final_status,
            correction_count: wm.correction_count,
            backspace_count: wm.backspace_count,
            word_length: wm.word_length,
            contains_repeat_pattern: wm.contains_repeat_pattern,
            contains_focus_bigram: wm.contains_focus_bigram,
            contains_focus_trigram: wm.contains_focus_trigram,
            start_time_ms: wm.start_time_ms,
            end_time_ms: wm.end_time_ms,
            duration_ms: wm.duration_ms,
            pause_count: wm.pause_count,
            max_pause_ms: wm.max_pause_ms,
            error_count: wm.error_count,
          },
          select: { word_id: true },
        });

        if (wm.word_error_events.length > 0) {
          await tx.wordErrorEvent.createMany({
            data: wm.word_error_events.map((ev) => ({
              word_mistake_id: createdMistake.word_id,
              event_order: ev.event_order,
              error_type: ev.error_type,
              corrected: ev.corrected,
              char_index_start: ev.char_index_start,
              char_index_end: ev.char_index_end,
              position_in_word: ev.position_in_word,
              expected_text: ev.expected_text,
              actual_text: ev.actual_text,
              pause_ms: ev.pause_ms,
              preceded_by_pause: ev.preceded_by_pause,
              details_jsonb: ev.details_jsonb as Prisma.InputJsonValue,
            })),
          });
        }
      }
    });

    return { ok: true };
  } catch (err) {
    console.error("saveWordMistakes error:", err);
    return { error: String(err) };
  }
}
