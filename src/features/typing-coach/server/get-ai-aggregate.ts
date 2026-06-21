import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@/generated/prisma/client";
import type { Prisma as PrismaNamespace } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { roundTo2 } from "@/features/typing-game/utils/stats";
import {
  type TypingCoachAIAggregate,
  TypingCoachAIAggregateSchema,
} from "../schemas/ai-aggregate";

export const ROLLING_WINDOW_DAYS = 30;

// The AI coach only looks at a recent rolling window and caps how many sessions
// can be included. This keeps the prompt useful and stops it becoming too large.
const SESSION_CAP = 30;
const TOP_WORDS_BY_DIFFICULTY = 30;
const INCLUDE_PATTERN_EXTRAS = true;
const TOP_ERROR_PATTERNS = 50;
// First AI run requires enough games and enough real mistakes. Pause events are
// excluded from the error threshold because a pause is hesitation, not a typo.
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
  // Build the short message shown in the UI when the user has not produced
  // enough saved typing data for AI coaching yet.
  if (missing.sessions_needed > 0) {
    return `Play ${missing.sessions_needed} more game${missing.sessions_needed === 1 ? "" : "s"} to unlock AI coaching.`;
  }
  if (missing.non_pause_error_events_needed > 0) {
    return "You have enough sessions, but not enough error data yet. Keep playing a bit more and we will unlock AI coaching.";
  }
  return "Not enough data for AI coaching yet.";
}

function normalizeWindowDays(windowDays: number): number {
  // Make sure the window is a positive whole number. Bad input falls back to the
  // default rolling window.
  const n = Math.floor(Number(windowDays));
  if (!Number.isFinite(n)) return ROLLING_WINDOW_DAYS;
  return Math.max(1, n);
}

async function computeEligibilityForScope(
  userId: string,
  allowedIds: number[]
): Promise<TypingCoachAIEligibility> {
  // Raw SQL needs an ID filter because all counts must use the exact sessions
  // selected for this AI window.
  const idFilterSql =
    allowedIds.length > 0
      ? Prisma.sql`AND wm.typing_result_id IN (${Prisma.join(allowedIds)})`
      // If there are no allowed sessions, force the query to match no rows.
      : Prisma.sql`AND 1 = 0`;

  // Session count is the number of allowed typing result IDs after the rolling
  // window and session cap have been applied.
  const scopedSessionCount = allowedIds.length;

  // Count real error events in the selected sessions. The joins go from
  // word_error_events -> word_mistakes -> typing_results so the query can check
  // both the owning user and the typing_result_id scope.
  const nonPauseErrorEventRows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM word_error_events we
    JOIN word_mistakes wm ON wm.word_id = we.word_mistake_id
    JOIN typing_results tr ON tr.id = wm.typing_result_id
    WHERE tr.user_id = ${userId}
      ${idFilterSql}
      AND we.error_type <> 'pause'
  `);

  // PostgreSQL COUNT returns bigint, so convert it to a JavaScript number before
  // comparing with the threshold constants.
  const nonPauseErrorEventCount = Number(nonPauseErrorEventRows[0]?.count ?? BigInt(0));
  // Work out exactly what the user is still missing.
  const sessionsNeeded = Math.max(0, MIN_SESSIONS_FOR_AI - scopedSessionCount);
  const errorsNeeded = Math.max(
    0,
    MIN_NON_PAUSE_ERROR_EVENTS_FOR_AI - nonPauseErrorEventCount
  );

  if (sessionsNeeded === 0 && errorsNeeded === 0) {
    // The user has enough scoped sessions and enough non-pause errors.
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
  windowDays: number = ROLLING_WINDOW_DAYS
): Promise<TypingCoachAIEligibility> {
  // First find which typing results are allowed for this user/window, then run
  // the threshold check against only those IDs.
  const days = normalizeWindowDays(windowDays);
  const allowedIds = await getAllowedTypingResultIds(userId, days);
  return computeEligibilityForScope(userId, allowedIds);
}

export async function getTypingCoachAIEligibility(
  windowDays: number = ROLLING_WINDOW_DAYS
): Promise<TypingCoachAIEligibility | { error: string }> {
  // Public server helper: get the signed-in user from Clerk, then reuse the
  // user-specific eligibility function.
  const { userId } = await auth();
  if (!userId) return { error: "Not signed in" };
  return getTypingCoachAIEligibilityForUser(userId, windowDays);
}

function aggregatedEventPatternKey(row: {
  error_type: string;
  char_index_start: number;
  char_index_end: number;
  position_in_word: string;
  expected_text: string;
  actual_text: string;
}) {
  // Turns an aggregated error signature into a stable string key. This is used
  // to check whether a word contains one of the globally common error patterns.
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
  // Raw SQL aggregate values may arrive as numbers, strings or Decimal-like
  // objects depending on the database driver. This normalises them safely.
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
  windowDays: number
): Promise<number[]> {
  // Cutoff date for the rolling time window.
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // Take the latest saved sessions first. This applies SESSION_CAP before the
  // date filter, so the final set is "latest 30 sessions, but only if they are
  // also inside the rolling window".
  const topSessions = await prisma.typingResults.findMany({
    where: { user_id: userId },
    orderBy: { ended_at: "desc" },
    take: SESSION_CAP,
    select: { id: true, ended_at: true },
  });

  // Remove sessions without an end time and sessions older than the rolling
  // window, then return only their IDs for later queries.
  return topSessions
    .filter((t) => t.ended_at != null && t.ended_at >= since)
    .map((t) => t.id);
}

function difficultyScoreFromBuckets(entry: {
  error_count: { total: number };
  final_status_counts: { incorrect_count: number };
  error_type_counts?: { pause_count: number };
  correction: { total: number };
}): number {
  // Heuristic score used to rank which words are most useful for the AI to see.
  // Errors matter most, unresolved incorrect words count extra, pauses and
  // corrections add smaller penalties.
  return roundTo2(
    entry.error_count.total +
      entry.final_status_counts.incorrect_count * 2 +
      (entry.error_type_counts?.pause_count ?? 0) * 0.5 +
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
  // Convert one raw SQL aggregate row into the JSON shape expected by the Zod
  // schema and the LLM prompt.
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
  windowDays: number = ROLLING_WINDOW_DAYS,
  options?: { userId: string }
): Promise<TypingCoachAIAggregate | { error: string } | TypingCoachAIEligibility> {
  // Some callers already know the user ID, such as background jobs. Otherwise,
  // read the current signed-in user through Clerk server auth.
  let userId: string | undefined = options?.userId;
  if (!userId) {
    const { userId: authId } = await auth();
    userId = authId ?? undefined;
  }
  if (!userId) return { error: "Not signed in" };

  // Normalise the requested window and resolve the exact typing_result IDs that
  // every query below must use.
  const effectiveWindowDays = normalizeWindowDays(windowDays);
  const allowedIds = await getAllowedTypingResultIds(userId, effectiveWindowDays);

  // Prisma filter reused by the word_mistake query. It limits data to the chosen
  // typing result IDs.
  const typingResultFilter: PrismaNamespace.TypingResultsWhereInput = {
    id: { in: allowedIds },
  };

  // Only aggregate words owned by this user, inside the chosen session scope,
  // and with at least one linked error event.
  const wordWhere: PrismaNamespace.WordMistakeWhereInput = {
    typing_result: {
      user_id: userId,
      ...typingResultFilter,
    },
    word_error_events: { some: {} },
  };

  try {
    // Stop before expensive aggregation if the user does not meet the minimum
    // session/error thresholds.
    const eligibility = await computeEligibilityForScope(userId, allowedIds);
    if (!eligibility.ready) return eligibility;

    // Same ID filter as eligibility, but in raw SQL form for queryRaw calls.
    const idFilterSql =
      allowedIds.length > 0
        ? Prisma.sql`AND wm.typing_result_id IN (${Prisma.join(allowedIds)})`
        : Prisma.sql`AND 1 = 0`;

    // Run the four independent aggregate queries in one Prisma transaction so
    // they read a consistent database snapshot.
    const [
      wordRows,
      targetWordRows,
      aggregatedErrorRows,
      globalErrorPatternRows,
    ] = await prisma.$transaction([
      // Query 1: fetch word-level rows. Each row is one WordMistake record, and
      // these rows are later grouped in TypeScript by target_word.
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
      // Query 2: count final typed variants for each target word. This answers
      // questions like: for target "might", how many times did the user finish
      // with "migh"?
      prisma.$queryRaw<Array<{ target_word: string; final_word: string; count: bigint }>>(Prisma.sql`
        SELECT wm.target_word, wm.final_word, COUNT(*) AS count
        FROM word_mistakes wm
        JOIN typing_results tr ON tr.id = wm.typing_result_id
        WHERE tr.user_id = ${userId}
          ${idFilterSql}
          AND EXISTS (
            -- Only include words that actually have linked error telemetry.
            SELECT 1
            FROM word_error_events we2
            WHERE we2.word_mistake_id = wm.word_id
          )
        GROUP BY wm.target_word, wm.final_word
      `),
      // Query 3: group error events per target word. GROUP BY collapses repeated
      // identical errors into one row with a count and correction/pause totals.
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
          -- Count how many raw event rows share this same grouped signature.
          COUNT(*) AS count,
          -- Split correction states into separate counters so the AI can tell
          -- whether mistakes were fixed or left unresolved.
          SUM(CASE WHEN we.corrected = true THEN 1 ELSE 0 END) AS corrected_true_count,
          SUM(CASE WHEN we.corrected = false THEN 1 ELSE 0 END) AS corrected_false_count,
          SUM(CASE WHEN we.corrected IS NULL THEN 1 ELSE 0 END) AS corrected_null_count,
          SUM(CASE WHEN we.preceded_by_pause = true THEN 1 ELSE 0 END) AS preceded_by_pause_true_count,
          SUM(CASE WHEN we.preceded_by_pause = false THEN 1 ELSE 0 END) AS preceded_by_pause_false_count,
          -- Pause mean is only meaningful for pause events; non-pause groups
          -- normally produce null here.
          AVG(we.pause_ms) AS pause_ms_mean,
          -- Keep one representative details_jsonb object for keyboard metadata
          -- such as finger, row, key distance and omitted/inserted characters.
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
      // Query 4: find the most common non-pause error patterns globally across
      // the selected sessions, not separated by target word. This helps include
      // important repeated patterns even if their words are not in the top 30.
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
          -- Pause patterns are excluded here because this list is for typo
          -- patterns such as substitution, omission, insertion and transposition.
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

    // Count distinct sessions that actually contributed word rows.
    const uniqueSessionIds = new Set(wordRows.map((r) => r.typing_result_id));

    // Map target_word -> its final typed variants. This lets the payload show
    // common final outcomes for each target word.
    const targetWordMap = new Map<
      string,
      { target_word: string; total_attempts: number; final_variants: Array<{ final_word: string; count: number }> }
    >();
    for (const row of targetWordRows) {
      // Create or reuse the aggregate object for this target word.
      const existing = targetWordMap.get(row.target_word) ?? {
        target_word: row.target_word,
        total_attempts: 0,
        final_variants: [],
      };
      // Count is bigint from SQL, so convert it before storing in JSON.
      const c = Number(row.count);
      existing.total_attempts += c;
      existing.final_variants.push({ final_word: row.final_word, count: c });
      targetWordMap.set(row.target_word, existing);
    }

    // Main per-word aggregation map. Each key is a target word, and the value is
    // the combined telemetry for all attempts of that word.
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
        _maxPauseNonNullCount: number;
      }
    >();

    for (const row of wordRows) {
      // Create a new bucket the first time this target_word appears, otherwise
      // keep adding to the existing bucket.
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
        _maxPauseNonNullCount: 0,
      };

      // Track where in the prompt this word usually appeared: start, middle or
      // end. This is based on word_index divided by words_reached_at_end.
      bucketed.word_position_buckets.total_count++;
      const reached = row.words_reached_at_end;
      if (reached == null || reached <= 0) bucketed.word_position_buckets.start_count++;
      else {
        const progress = row.word_index / reached;
        if (progress <= 0.33) bucketed.word_position_buckets.start_count++;
        else if (progress <= 0.66) bucketed.word_position_buckets.middle_count++;
        else bucketed.word_position_buckets.end_count++;
      }

      // Count final statuses so the AI can tell if a word is often corrected,
      // left incorrect, skipped or finished with extra characters.
      bucketed.final_status_counts.total_count++;
      if (row.final_status === "corrected") bucketed.final_status_counts.corrected_count++;
      else if (row.final_status === "incorrect") bucketed.final_status_counts.incorrect_count++;
      else if (row.final_status === "skipped") bucketed.final_status_counts.skipped_count++;
      else if (row.final_status === "extra") bucketed.final_status_counts.extra_count++;

      // Sum per-word counters. Means are calculated later after all rows are
      // processed.
      bucketed.correction.total += row.correction_count;
      bucketed.backspace.total += row.backspace_count;
      bucketed.error_count.total += row.error_count;

      if (row.duration_ms != null) {
        // Store duration as a running sum, with a separate non-null count for
        // the mean.
        bucketed.duration_ms.mean += row.duration_ms;
        bucketed._durationNonNullCount++;
      }

      if (row.max_pause_ms > bucketed.max_pause_ms.global_max_pause_ms) {
        // Keep the single worst pause for this target word.
        bucketed.max_pause_ms.global_max_pause_ms = row.max_pause_ms;
      }
      if (row.max_pause_ms != null) {
        // Also keep a running sum to calculate the average max pause.
        bucketed.max_pause_ms.mean_max_pause_ms += row.max_pause_ms;
        bucketed._maxPauseNonNullCount++;
      }

      perWord.set(row.target_word, bucketed);
    }

    // Attach final typed variants from Query 2 onto the per-word buckets.
    for (const [targetWord, entry] of targetWordMap.entries()) {
      const bucketed = perWord.get(targetWord);
      if (!bucketed) continue;
      bucketed.final_variants = entry.final_variants;
    }

    // Attach grouped error patterns from Query 3 onto each target word bucket.
    for (const row of aggregatedErrorRows) {
      const bucketed = perWord.get(row.target_word);
      if (!bucketed) continue;
      const n = Number(row.count);
      // Update total error-type counters for this word.
      bucketed.error_type_counts.total_count += n;
      if (row.error_type === "substitution") bucketed.error_type_counts.substitution_count += n;
      else if (row.error_type === "transposition") bucketed.error_type_counts.transposition_count += n;
      else if (row.error_type === "omission") bucketed.error_type_counts.omission_count += n;
      else if (row.error_type === "insertion") bucketed.error_type_counts.insertion_count += n;
      else if (row.error_type === "pause") bucketed.error_type_counts.pause_count += n;

      // Store the full aggregated event row for the AI prompt.
      bucketed.word_error_events.push(mapRowToAggregatedEvent(row));
    }

    // Convert the internal Map objects into plain JSON objects and calculate all
    // means from the totals collected above.
    const wordsPayload = [...perWord.values()].map((entry) => ({
      word_position_buckets: entry.word_position_buckets,
      target_word: entry.target_word,
      final_variants: entry.final_variants,
      final_status_counts: entry.final_status_counts,
      correction: {
        total: entry.correction.total,
        mean:
          // Average corrections per attempt of this target word.
          entry.final_status_counts.total_count > 0
            ? roundTo2(entry.correction.total / entry.final_status_counts.total_count)
            : 0,
      },
      backspace: {
        total: entry.backspace.total,
        mean:
          // Average backspaces per attempt of this target word.
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
          // Average word duration, using only rows that actually have duration.
          entry._durationNonNullCount > 0
            ? roundTo2(entry.duration_ms.mean / entry._durationNonNullCount)
            : 0,
      },
      max_pause_ms: {
        mean_max_pause_ms:
          // Average of max_pause_ms values for this word.
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

    // Add a temporary difficulty score so the system can rank which words are
    // most important to include in the AI prompt.
    const withScores = wordsPayload.map((w) => ({
      ...w,
      difficulty_score: difficultyScoreFromBuckets({
        error_count: w.error_count,
        final_status_counts: w.final_status_counts,
        error_type_counts: w.error_type_counts,
        correction: w.correction,
      }),
    }));

    // Highest difficulty score first.
    const sortedByDifficulty = [...withScores].sort(
      (a, b) => b.difficulty_score - a.difficulty_score
    );

    // Main top word list: the 30 most difficult target words.
    const topByDifficulty = sortedByDifficulty.slice(0, TOP_WORDS_BY_DIFFICULTY);

    // Pattern extras include words outside the top 30 if they contain one of the
    // globally common top error patterns. This prevents important repeated error
    // signatures from being dropped just because their word scored lower.
    const patternExtras =
      INCLUDE_PATTERN_EXTRAS
        ? (() => {
            // Convert global top patterns into keys for quick membership checks.
            const topPatternKeys = new Set(
              globalErrorPatternRows.map((row) => aggregatedEventPatternKey(row))
            );
            return sortedByDifficulty
              .slice(TOP_WORDS_BY_DIFFICULTY)
              .filter((w) =>
                // Keep this word if any of its word-level error events match a
                // global top error pattern.
                w.word_error_events.some((ev) =>
                  topPatternKeys.has(aggregatedEventPatternKey(ev))
                )
              );
          })()
        : [];

    // Final selected words sent to the AI include top difficulty words plus any
    // pattern extras.
    const top_words = [...topByDifficulty, ...patternExtras];

    // `words` is the prompt-facing word list without the temporary score field.
    const words = top_words.map(({ difficulty_score: _score, ...rest }) => rest);

    // Count how many word mistake rows are represented by the final selected
    // word list.
    const summaryWordRowCount = top_words.reduce(
      (sum, w) => sum + w.final_status_counts.total_count,
      0
    );

    // Top global non-pause error patterns are included separately for the AI to
    // see repeated mistakes across words.
    const top_error_patterns = globalErrorPatternRows.map((row) => mapRowToAggregatedEvent(row));

    // Final aggregate payload. This is the structured JSON that later becomes
    // the AI coach input.
    const payload: TypingCoachAIAggregate = {
      user_id: userId,
      window_days: effectiveWindowDays,
      history: {
        session_cap: SESSION_CAP,
        window_days: effectiveWindowDays,
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

    // Validate the final aggregate shape before it is passed to prompt building.
    return TypingCoachAIAggregateSchema.parse(payload);
  } catch (err) {
    console.error("getTypingCoachAIAggregate error:", err);
    return { error: String(err) };
  }
}
