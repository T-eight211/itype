"use server";

import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@/generated/prisma/client";
import type { Prisma as PrismaNamespace } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { roundTo2 } from "@/features/typing-game/utils/stats";
import {
  type TypingCoachAIAggregate,
  TypingCoachAIAggregateSchema,
} from "../schemas/ai-aggregate";

type WindowArg = "last_30d" | "lifetime";

const SESSION_CAP = 30;
const TOP_WORDS_BY_DIFFICULTY = 30;
const INCLUDE_PATTERN_EXTRAS = true;
const TOP_ERROR_PATTERNS = 50;
const ROLLING_WINDOW_DAYS = 30;
const MIN_SESSIONS_FOR_AI = 15;
const MIN_NON_PAUSE_ERROR_EVENTS_FOR_AI = 25;

export type TypingCoachAIEligibility =
  | { ready: true }
  | {
      ready: false;
      reason: "insufficient_data";
      requirements: {
        min_sessions: number;
        min_non_pause_error_events: number;
      };
      current: {
        session_count: number;
        non_pause_error_event_count: number;
      };
      missing: {
        sessions_needed: number;
        non_pause_error_events_needed: number;
      };
      message: string;
    };

function buildInsufficientDataMessage(missing: {
  sessions_needed: number;
  non_pause_error_events_needed: number;
}) {
  if (missing.sessions_needed > 0) {
    return `Play ${missing.sessions_needed} more game${missing.sessions_needed === 1 ? "" : "s"} to unlock AI coaching.`;
  }
  if (missing.non_pause_error_events_needed > 0) {
    return "You have enough sessions, but not enough error data yet. Keep playing a bit more and we will unlock AI coaching.";
  }
  return "Not enough data for AI coaching yet.";
}

async function computeEligibilityForScope(
  userId: string,
  window: WindowArg,
  allowedIds: number[] | null
): Promise<TypingCoachAIEligibility> {
  const idFilterSql =
    allowedIds && allowedIds.length > 0
      ? Prisma.sql`AND wm.typing_result_id IN (${Prisma.join(allowedIds)})`
      : Prisma.empty;

  const scopedSessionCount =
    window === "lifetime"
      ? await prisma.typingResults.count({
          where: { user_id: userId },
        })
      : allowedIds?.length ?? 0;

  const nonPauseErrorEventRows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM word_error_events we
    JOIN word_mistakes wm ON wm.word_id = we.word_mistake_id
    JOIN typing_results tr ON tr.id = wm.typing_result_id
    WHERE tr.user_id = ${userId}
      ${idFilterSql}
      AND we.error_type <> 'pause'
  `);

  const nonPauseErrorEventCount = Number(nonPauseErrorEventRows[0]?.count ?? BigInt(0));
  const sessionsNeeded = Math.max(0, MIN_SESSIONS_FOR_AI - scopedSessionCount);
  const errorsNeeded = Math.max(
    0,
    MIN_NON_PAUSE_ERROR_EVENTS_FOR_AI - nonPauseErrorEventCount
  );

  if (sessionsNeeded === 0 && errorsNeeded === 0) {
    return { ready: true };
  }

  const missing = {
    sessions_needed: sessionsNeeded,
    non_pause_error_events_needed: errorsNeeded,
  };

  return {
    ready: false,
    reason: "insufficient_data",
    requirements: {
      min_sessions: MIN_SESSIONS_FOR_AI,
      min_non_pause_error_events: MIN_NON_PAUSE_ERROR_EVENTS_FOR_AI,
    },
    current: {
      session_count: scopedSessionCount,
      non_pause_error_event_count: nonPauseErrorEventCount,
    },
    missing,
    message: buildInsufficientDataMessage(missing),
  };
}

export async function getTypingCoachAIEligibilityForUser(
  userId: string,
  window: WindowArg = "last_30d"
): Promise<TypingCoachAIEligibility> {
  const allowedIds = await getAllowedTypingResultIds(userId, window);
  return computeEligibilityForScope(userId, window, allowedIds);
}

export async function getTypingCoachAIEligibility(
  window: WindowArg = "last_30d"
): Promise<TypingCoachAIEligibility | { error: string }> {
  const { userId } = await auth();
  if (!userId) return { error: "Not signed in" };
  return getTypingCoachAIEligibilityForUser(userId, window);
}

function aggregatedEventPatternKey(row: {
  error_type: string;
  char_index_start: number;
  char_index_end: number;
  position_in_word: string;
  expected_text: string;
  actual_text: string;
}) {
  return JSON.stringify([
    row.error_type,
    row.char_index_start,
    row.char_index_end,
    row.position_in_word,
    row.expected_text,
    row.actual_text,
  ]);
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === "object" && value !== null && "toString" in value) {
    const parsed = Number(String(value));
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

async function getAllowedTypingResultIds(
  userId: string,
  window: WindowArg
): Promise<number[] | null> {
  if (window === "lifetime") return null;

  const since = new Date(Date.now() - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const topSessions = await prisma.typingResults.findMany({
    where: { user_id: userId },
    orderBy: { ended_at: "desc" },
    take: SESSION_CAP,
    select: { id: true, ended_at: true },
  });

  return topSessions
    .filter((t) => t.ended_at != null && t.ended_at >= since)
    .map((t) => t.id);
}

function difficultyScoreFromBuckets(entry: {
  error_count: { total: number };
  final_status_counts: { incorrect_count: number };
  pause: { total_count: number };
  correction: { total: number };
}): number {
  return roundTo2(
    entry.error_count.total +
      entry.final_status_counts.incorrect_count * 2 +
      entry.pause.total_count * 0.5 +
      entry.correction.total * 0.5
  );
}

function mapRowToAggregatedEvent(row: {
  error_type: string;
  char_index_start: number;
  char_index_end: number;
  position_in_word: string;
  expected_text: string;
  actual_text: string;
  count: bigint;
  corrected_true_count: bigint;
  corrected_false_count: bigint;
  corrected_null_count: bigint;
  preceded_by_pause_true_count: bigint;
  preceded_by_pause_false_count: bigint;
  pause_ms_mean: number | null;
  details_jsonb: unknown;
}) {
  return {
    error_type: row.error_type as
      | "substitution"
      | "transposition"
      | "omission"
      | "insertion"
      | "pause",
    char_index_start: row.char_index_start,
    char_index_end: row.char_index_end,
    position_in_word: row.position_in_word as "start" | "middle" | "end" | "whole",
    expected_text: row.expected_text,
    actual_text: row.actual_text,
    count: Number(row.count),
    corrected_true_count: Number(row.corrected_true_count),
    corrected_false_count: Number(row.corrected_false_count),
    corrected_null_count: Number(row.corrected_null_count),
    preceded_by_pause_true_count: Number(row.preceded_by_pause_true_count),
    preceded_by_pause_false_count: Number(row.preceded_by_pause_false_count),
    pause_ms_mean:
      toNumberOrNull(row.pause_ms_mean) == null
        ? null
        : roundTo2(toNumberOrNull(row.pause_ms_mean) as number),
    details_jsonb: row.details_jsonb ?? null,
  };
}

export async function getTypingCoachAIAggregate(
  window: WindowArg = "last_30d",
  options?: { userId: string }
): Promise<TypingCoachAIAggregate | { error: string } | TypingCoachAIEligibility> {
  let userId: string | undefined = options?.userId;
  if (!userId) {
    const { userId: authId } = await auth();
    userId = authId ?? undefined;
  }
  if (!userId) return { error: "Not signed in" };

  const allowedIds = await getAllowedTypingResultIds(userId, window);

  const typingResultFilter: PrismaNamespace.TypingResultsWhereInput | undefined =
    allowedIds && allowedIds.length > 0 ? { id: { in: allowedIds } } : undefined;

  const wordWhere: PrismaNamespace.WordMistakeWhereInput = {
    typing_result: {
      user_id: userId,
      ...typingResultFilter,
    },
    word_error_events: { some: {} },
  };

  try {
    const eligibility = await computeEligibilityForScope(userId, window, allowedIds);
    if (!eligibility.ready) return eligibility;

    const idFilterSql =
      allowedIds && allowedIds.length > 0
        ? Prisma.sql`AND wm.typing_result_id IN (${Prisma.join(allowedIds)})`
        : Prisma.empty;

    const [
      wordRows,
      targetWordRows,
      aggregatedErrorRows,
      globalErrorPatternRows,
    ] = await prisma.$transaction([
      prisma.wordMistake.findMany({
        where: wordWhere,
        select: {
          target_word: true,
          word_index: true,
          words_reached_at_end: true,
          final_status: true,
          correction_count: true,
          backspace_count: true,
          word_length: true,
          contains_repeat_pattern: true,
          contains_focus_bigram: true,
          contains_focus_trigram: true,
          duration_ms: true,
          pause_count: true,
          max_pause_ms: true,
          error_count: true,
          typing_result_id: true,
        },
      }),
      prisma.$queryRaw<Array<{ target_word: string; final_word: string; count: bigint }>>(Prisma.sql`
        SELECT wm.target_word, wm.final_word, COUNT(*) AS count
        FROM word_mistakes wm
        JOIN typing_results tr ON tr.id = wm.typing_result_id
        WHERE tr.user_id = ${userId}
          ${idFilterSql}
          AND EXISTS (
            SELECT 1
            FROM word_error_events we2
            WHERE we2.word_mistake_id = wm.word_id
          )
        GROUP BY wm.target_word, wm.final_word
      `),
      prisma.$queryRaw<
        Array<{
          target_word: string;
          error_type: string;
          char_index_start: number;
          char_index_end: number;
          position_in_word: string;
          expected_text: string;
          actual_text: string;
          count: bigint;
          corrected_true_count: bigint;
          corrected_false_count: bigint;
          corrected_null_count: bigint;
          preceded_by_pause_true_count: bigint;
          preceded_by_pause_false_count: bigint;
          pause_ms_mean: number | null;
          details_jsonb: unknown;
        }>
      >(Prisma.sql`
        SELECT
          wm.target_word,
          we.error_type,
          we.char_index_start,
          we.char_index_end,
          we.position_in_word,
          we.expected_text,
          we.actual_text,
          COUNT(*) AS count,
          SUM(CASE WHEN we.corrected = true THEN 1 ELSE 0 END) AS corrected_true_count,
          SUM(CASE WHEN we.corrected = false THEN 1 ELSE 0 END) AS corrected_false_count,
          SUM(CASE WHEN we.corrected IS NULL THEN 1 ELSE 0 END) AS corrected_null_count,
          SUM(CASE WHEN we.preceded_by_pause = true THEN 1 ELSE 0 END) AS preceded_by_pause_true_count,
          SUM(CASE WHEN we.preceded_by_pause = false THEN 1 ELSE 0 END) AS preceded_by_pause_false_count,
          AVG(we.pause_ms) AS pause_ms_mean,
          (JSONB_AGG(we.details_jsonb) FILTER (WHERE we.details_jsonb IS NOT NULL))->0 AS details_jsonb
        FROM word_error_events we
        JOIN word_mistakes wm ON wm.word_id = we.word_mistake_id
        JOIN typing_results tr ON tr.id = wm.typing_result_id
        WHERE tr.user_id = ${userId}
          ${idFilterSql}
        GROUP BY
          wm.target_word,
          we.error_type,
          we.char_index_start,
          we.char_index_end,
          we.position_in_word,
          we.expected_text,
          we.actual_text
        ORDER BY count DESC
      `),
      prisma.$queryRaw<
        Array<{
          error_type: string;
          char_index_start: number;
          char_index_end: number;
          position_in_word: string;
          expected_text: string;
          actual_text: string;
          count: bigint;
          corrected_true_count: bigint;
          corrected_false_count: bigint;
          corrected_null_count: bigint;
          preceded_by_pause_true_count: bigint;
          preceded_by_pause_false_count: bigint;
          pause_ms_mean: number | null;
          details_jsonb: unknown;
        }>
      >(Prisma.sql`
        SELECT
          we.error_type,
          we.char_index_start,
          we.char_index_end,
          we.position_in_word,
          we.expected_text,
          we.actual_text,
          COUNT(*) AS count,
          SUM(CASE WHEN we.corrected = true THEN 1 ELSE 0 END) AS corrected_true_count,
          SUM(CASE WHEN we.corrected = false THEN 1 ELSE 0 END) AS corrected_false_count,
          SUM(CASE WHEN we.corrected IS NULL THEN 1 ELSE 0 END) AS corrected_null_count,
          SUM(CASE WHEN we.preceded_by_pause = true THEN 1 ELSE 0 END) AS preceded_by_pause_true_count,
          SUM(CASE WHEN we.preceded_by_pause = false THEN 1 ELSE 0 END) AS preceded_by_pause_false_count,
          AVG(we.pause_ms) AS pause_ms_mean,
          (JSONB_AGG(we.details_jsonb) FILTER (WHERE we.details_jsonb IS NOT NULL))->0 AS details_jsonb
        FROM word_error_events we
        JOIN word_mistakes wm ON wm.word_id = we.word_mistake_id
        JOIN typing_results tr ON tr.id = wm.typing_result_id
        WHERE tr.user_id = ${userId}
          ${idFilterSql}
          AND we.error_type <> 'pause'
        GROUP BY
          we.error_type,
          we.char_index_start,
          we.char_index_end,
          we.position_in_word,
          we.expected_text,
          we.actual_text
        ORDER BY count DESC
        LIMIT ${TOP_ERROR_PATTERNS}
      `),
    ]);

    const uniqueSessionIds = new Set(wordRows.map((r) => r.typing_result_id));

    const targetWordMap = new Map<
      string,
      { target_word: string; total_attempts: number; final_variants: Array<{ final_word: string; count: number }> }
    >();
    for (const row of targetWordRows) {
      const existing = targetWordMap.get(row.target_word) ?? {
        target_word: row.target_word,
        total_attempts: 0,
        final_variants: [],
      };
      const c = Number(row.count);
      existing.total_attempts += c;
      existing.final_variants.push({ final_word: row.final_word, count: c });
      targetWordMap.set(row.target_word, existing);
    }

    const perWord = new Map<
      string,
      {
        target_word: string;
        word_position_buckets: { start_count: number; middle_count: number; end_count: number; total_count: number };
        final_status_counts: {
          corrected_count: number;
          incorrect_count: number;
          skipped_count: number;
          extra_count: number;
          total_count: number;
        };
        correction: { total: number; mean: number };
        backspace: { total: number; mean: number };
        word_length: number;
        contains_repeat_pattern: boolean;
        contains_focus_bigram: boolean;
        contains_focus_trigram: boolean;
        duration_ms: { mean: number };
        pause: { total_count: number; mean_count: number };
        max_pause_ms: { mean_max_pause_ms: number; global_max_pause_ms: number };
        error_count: { total: number };
        final_variants: Array<{ final_word: string; count: number }>;
        word_error_events: Array<{
          error_type: "substitution" | "transposition" | "omission" | "insertion" | "pause";
          char_index_start: number;
          char_index_end: number;
          position_in_word: "start" | "middle" | "end" | "whole";
          expected_text: string;
          actual_text: string;
          count: number;
          corrected_true_count: number;
          corrected_false_count: number;
          corrected_null_count: number;
          preceded_by_pause_true_count: number;
          preceded_by_pause_false_count: number;
          pause_ms_mean: number | null;
          details_jsonb: unknown;
        }>;
        error_type_counts: {
          substitution_count: number;
          transposition_count: number;
          omission_count: number;
          insertion_count: number;
          pause_count: number;
          total_count: number;
        };
        _durationNonNullCount: number;
        _pauseRowCount: number;
        _maxPauseNonNullCount: number;
      }
    >();

    for (const row of wordRows) {
      const bucketed = perWord.get(row.target_word) ?? {
        target_word: row.target_word,
        word_position_buckets: { start_count: 0, middle_count: 0, end_count: 0, total_count: 0 },
        final_status_counts: {
          corrected_count: 0,
          incorrect_count: 0,
          skipped_count: 0,
          extra_count: 0,
          total_count: 0,
        },
        correction: { total: 0, mean: 0 },
        backspace: { total: 0, mean: 0 },
        word_length: row.word_length,
        contains_repeat_pattern: row.contains_repeat_pattern,
        contains_focus_bigram: row.contains_focus_bigram,
        contains_focus_trigram: row.contains_focus_trigram,
        duration_ms: { mean: 0 },
        pause: { total_count: 0, mean_count: 0 },
        max_pause_ms: { mean_max_pause_ms: 0, global_max_pause_ms: 0 },
        error_count: { total: 0 },
        final_variants: [],
        word_error_events: [],
        error_type_counts: {
          substitution_count: 0,
          transposition_count: 0,
          omission_count: 0,
          insertion_count: 0,
          pause_count: 0,
          total_count: 0,
        },
        _durationNonNullCount: 0,
        _pauseRowCount: 0,
        _maxPauseNonNullCount: 0,
      };

      bucketed.word_position_buckets.total_count++;
      const reached = row.words_reached_at_end;
      if (reached == null || reached <= 0) bucketed.word_position_buckets.start_count++;
      else {
        const progress = row.word_index / reached;
        if (progress <= 0.33) bucketed.word_position_buckets.start_count++;
        else if (progress <= 0.66) bucketed.word_position_buckets.middle_count++;
        else bucketed.word_position_buckets.end_count++;
      }

      bucketed.final_status_counts.total_count++;
      if (row.final_status === "corrected") bucketed.final_status_counts.corrected_count++;
      else if (row.final_status === "incorrect") bucketed.final_status_counts.incorrect_count++;
      else if (row.final_status === "skipped") bucketed.final_status_counts.skipped_count++;
      else if (row.final_status === "extra") bucketed.final_status_counts.extra_count++;

      bucketed.correction.total += row.correction_count;
      bucketed.backspace.total += row.backspace_count;
      bucketed.error_count.total += row.error_count;
      bucketed.pause.total_count += row.pause_count;

      if (row.duration_ms != null) {
        bucketed.duration_ms.mean += row.duration_ms;
        bucketed._durationNonNullCount++;
      }
      bucketed._pauseRowCount++;

      if (row.max_pause_ms > bucketed.max_pause_ms.global_max_pause_ms) {
        bucketed.max_pause_ms.global_max_pause_ms = row.max_pause_ms;
      }
      if (row.max_pause_ms != null) {
        bucketed.max_pause_ms.mean_max_pause_ms += row.max_pause_ms;
        bucketed._maxPauseNonNullCount++;
      }

      perWord.set(row.target_word, bucketed);
    }

    for (const [targetWord, entry] of targetWordMap.entries()) {
      const bucketed = perWord.get(targetWord);
      if (!bucketed) continue;
      bucketed.final_variants = entry.final_variants;
    }

    for (const row of aggregatedErrorRows) {
      const bucketed = perWord.get(row.target_word);
      if (!bucketed) continue;
      const n = Number(row.count);
      bucketed.error_type_counts.total_count += n;
      if (row.error_type === "substitution") bucketed.error_type_counts.substitution_count += n;
      else if (row.error_type === "transposition") bucketed.error_type_counts.transposition_count += n;
      else if (row.error_type === "omission") bucketed.error_type_counts.omission_count += n;
      else if (row.error_type === "insertion") bucketed.error_type_counts.insertion_count += n;
      else if (row.error_type === "pause") bucketed.error_type_counts.pause_count += n;

      bucketed.word_error_events.push(mapRowToAggregatedEvent(row));
    }

    const wordsPayload = [...perWord.values()].map((entry) => ({
      word_position_buckets: entry.word_position_buckets,
      target_word: entry.target_word,
      final_variants: entry.final_variants,
      final_status_counts: entry.final_status_counts,
      correction: {
        total: entry.correction.total,
        mean:
          entry.final_status_counts.total_count > 0
            ? roundTo2(entry.correction.total / entry.final_status_counts.total_count)
            : 0,
      },
      backspace: {
        total: entry.backspace.total,
        mean:
          entry.final_status_counts.total_count > 0
            ? roundTo2(entry.backspace.total / entry.final_status_counts.total_count)
            : 0,
      },
      word_length: entry.word_length,
      contains_repeat_pattern: entry.contains_repeat_pattern,
      contains_focus_bigram: entry.contains_focus_bigram,
      contains_focus_trigram: entry.contains_focus_trigram,
      duration_ms: {
        mean:
          entry._durationNonNullCount > 0
            ? roundTo2(entry.duration_ms.mean / entry._durationNonNullCount)
            : 0,
      },
      pause: {
        total_count: entry.pause.total_count,
        mean_count:
          entry._pauseRowCount > 0 ? roundTo2(entry.pause.total_count / entry._pauseRowCount) : 0,
      },
      max_pause_ms: {
        mean_max_pause_ms:
          entry._maxPauseNonNullCount > 0
            ? roundTo2(entry.max_pause_ms.mean_max_pause_ms / entry._maxPauseNonNullCount)
            : 0,
        global_max_pause_ms: entry.max_pause_ms.global_max_pause_ms,
      },
      error_count: {
        total: entry.error_count.total,
      },
      word_error_events: entry.word_error_events,
      error_type_counts: entry.error_type_counts,
    }));

    const withScores = wordsPayload.map((w) => ({
      ...w,
      difficulty_score: difficultyScoreFromBuckets({
        error_count: w.error_count,
        final_status_counts: w.final_status_counts,
        pause: w.pause,
        correction: w.correction,
      }),
    }));

    const sortedByDifficulty = [...withScores].sort(
      (a, b) => b.difficulty_score - a.difficulty_score
    );

    const topByDifficulty = sortedByDifficulty.slice(0, TOP_WORDS_BY_DIFFICULTY);

    const patternExtras =
      INCLUDE_PATTERN_EXTRAS
        ? (() => {
            const topPatternKeys = new Set(
              globalErrorPatternRows.map((row) => aggregatedEventPatternKey(row))
            );
            return sortedByDifficulty
              .slice(TOP_WORDS_BY_DIFFICULTY)
              .filter((w) =>
                w.word_error_events.some((ev) =>
                  topPatternKeys.has(aggregatedEventPatternKey(ev))
                )
              );
          })()
        : [];

    const top_words = [...topByDifficulty, ...patternExtras];

    const words = top_words.map(({ difficulty_score: _score, ...rest }) => rest);

    const summaryWordRowCount = top_words.reduce(
      (sum, w) => sum + w.final_status_counts.total_count,
      0
    );

    const top_error_patterns = globalErrorPatternRows.map((row) => mapRowToAggregatedEvent(row));

    const payload: TypingCoachAIAggregate = {
      user_id: userId,
      window,
      history:
        window === "lifetime"
          ? undefined
          : {
              session_cap: SESSION_CAP,
              window_days: ROLLING_WINDOW_DAYS,
              effective_session_count: uniqueSessionIds.size,
            },
      session_count: uniqueSessionIds.size,
      word_count: summaryWordRowCount,
      distinct_word_count: top_words.length,
      words,
      top_words,
      top_error_patterns,
      generated_at: new Date().toISOString(),
    };

    return TypingCoachAIAggregateSchema.parse(payload);
  } catch (err) {
    console.error("getTypingCoachAIAggregate error:", err);
    return { error: String(err) };
  }
}
