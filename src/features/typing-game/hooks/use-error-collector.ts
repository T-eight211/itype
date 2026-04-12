import { useRef, useCallback, useMemo } from "react";
import { computeAlignment, type AlignmentResult } from "../lib/alignment";
import {
  buildKeyPairDetail,
  getKeyInfo,
} from "../lib/keyboard-geometry";
import { hasRepeatPattern, hasFocusBigram, hasFocusTrigram } from "../lib/word-analysis";
import type { WordErrorEvent } from "../schemas/word-error-event";
import type { WordMistake, FinalStatus } from "../schemas/word-mistake";
import type { PositionInWord } from "../schemas/word-error-event";

/** Inter-keystroke gap above this (ms) counts as a pause error; still capped at 2000 ms elsewhere. */
const PAUSE_GAP_THRESHOLD_MS = 750;

// ── Per-word mutable state ──

type WordState = {
  wordIndex: number;
  targetWord: string;
  /** Snapshot of what the user typed, set on space press / game end. */
  snapshotWord: string | null;
  typedLength: number;
  wasCorrect: boolean;
  isBackspacing: boolean;
  /** Non-pause error events derived from diff at word boundaries. */
  errorEvents: WordErrorEvent[];
  /**
   * Errors from typing segments ended by backspacing to a full correct prefix (e.g. "tb"→"t" keeps the
   * a→b episode so a later full-word replace for "trre" does not drop it).
   */
  archivedErrorEvents: WordErrorEvent[];
  /**
   * After a backspace that still leaves the word wrong but keeps a non-empty correct prefix (e.g. "lrr"→"lr"),
   * do not merge new classifyWordErrors on forward keys or space — only pauses keep accumulating until the
   * user realigns to a full correct prefix or clears the word. Avoids recording new substitutions past that
   * partial recovery while still allowing first-char-wrong flows (correctPrefixLen 0) to keep merging.
   */
  suppressForwardErrorMerges: boolean;
  /** Pause events collected per-keystroke. */
  pauseEvents: WordErrorEvent[];
  backspaceCount: number;
  correctionCount: number;
  startTimeMs: number | null;
  endTimeMs: number | null;
  pauseCount: number;
  maxPauseMs: number;
};

// ── Helpers ──

function wordErrorEventMergeKey(e: WordErrorEvent): string {
  return `${e.error_type}:${e.char_index_start}:${e.char_index_end}:${e.expected_text}:${e.actual_text}`;
}

function dedupeMergeWordErrorEvents(existing: WordErrorEvent[], incoming: WordErrorEvent[]): WordErrorEvent[] {
  const seen = new Set(existing.map(wordErrorEventMergeKey));
  const out = [...existing];
  for (const ev of incoming) {
    const k = wordErrorEventMergeKey(ev);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(ev);
    }
  }
  return out;
}

function positionInWord(
  charStart: number,
  charEnd: number,
  wordLength: number
): PositionInWord {
  if (charStart === 0 && charEnd >= wordLength - 1) return "whole";
  if (charStart === 0) return "start";
  if (charEnd >= wordLength - 1) return "end";
  return "middle";
}

type PromptWord = {
  word: string;
  promptStart: number;
  promptEnd: number;
};

function splitPromptWords(displayText: string): PromptWord[] {
  const result: PromptWord[] = [];
  let i = 0;
  while (i < displayText.length) {
    if (displayText[i] === " ") { i++; continue; }
    const start = i;
    while (i < displayText.length && displayText[i] !== " ") i++;
    result.push({ word: displayText.slice(start, i), promptStart: start, promptEnd: i });
  }
  return result;
}

function getCurrentWordIndex(
  alignment: AlignmentResult,
  displayText: string,
  spaceJustPressed: boolean
): number {
  const words = splitPromptWords(displayText);
  if (words.length === 0) return 0;
  const cursor = alignment.promptCursor;
  if (spaceJustPressed && cursor > 0) {
    for (let i = words.length - 1; i >= 0; i--) {
      if (cursor > words[i].promptStart) return i;
    }
  }
  for (let i = 0; i < words.length; i++) {
    if (cursor <= words[i].promptEnd) return i;
  }
  return Math.max(0, words.length - 1);
}

function getWordInput(
  alignment: AlignmentResult,
  displayText: string,
  rawInput: string,
  promptStart: number,
  promptEnd: number
): { typed: string; correctPrefixLen: number; hasExtras: boolean } {
  let correctPrefixLen = 0;
  let prefixBroken = false;
  let hasExtras = false;
  let minInputIdx = Infinity;
  let maxPromptInputIdx = -1;

  for (const cell of alignment.cells) {
    if (cell.type === "prompt" && cell.index >= promptStart && cell.index < promptEnd && cell.inputIndex != null) {
      minInputIdx = Math.min(minInputIdx, cell.inputIndex);
      maxPromptInputIdx = Math.max(maxPromptInputIdx, cell.inputIndex);
    }
  }

  for (const cell of alignment.cells) {
    if (cell.type === "prompt" && cell.index >= promptStart && cell.index < promptEnd) {
      if (cell.inputIndex != null) {
        if (!prefixBroken && cell.status === "correct") {
          correctPrefixLen++;
        } else {
          prefixBroken = true;
        }
      }
    } else if (
      cell.type === "extra" &&
      minInputIdx !== Infinity &&
      cell.inputIndex >= minInputIdx &&
      cell.inputIndex <= maxPromptInputIdx
    ) {
      hasExtras = true;
    }
  }

  // Include trailing keystrokes mapped as `extra` (e.g. "keep" + "keeep": final "p" is extra), not only prompt cells.
  let typed = "";
  if (minInputIdx !== Infinity) {
    const spaceAfter = rawInput.indexOf(" ", minInputIdx);
    const endExclusive = spaceAfter === -1 ? rawInput.length : spaceAfter;
    typed = rawInput.slice(minInputIdx, endExclusive);
    if (maxPromptInputIdx >= 0) {
      for (const cell of alignment.cells) {
        if (cell.type === "extra" && cell.inputIndex > maxPromptInputIdx && cell.inputIndex < endExclusive) {
          hasExtras = true;
        }
      }
    }
  }

  return { typed, correctPrefixLen, hasExtras };
}

// ── Diff-based error classification ──
// Compare target vs typed at word boundary (space press / game end).
// Rules:
//   1. Transposition: typed[ui]==target[ti+1] && typed[ui+1]==target[ti] → consume 2 from both
//   2. Grouped omission (shift): typed[ui:] === target[ti+k:] for some k≥1 → omitted target[ti..ti+k-1];
//      not insertion (typed char is a later target char shifted left after skips).
//   3. Omission: skip target char, check if ≥2 subsequent typed chars match shifted target (1 if near end)
//   4. Insertion: smallest m≥1 with typed[ui+m]===target[ti] (re-align to next expected char); repeat until
//      target consumed, then trailing block for extras past word end.
//   5. Otherwise: substitution (group consecutive)

/** Smallest k≥1 such that typed[ui] aligns with target[ti+k] and full suffixes match (pure left-shift from omissions). */
function omissionSuffixShiftLen(target: string, typed: string, ti: number, ui: number): number {
  if (ui >= typed.length || ti >= target.length) return 0;
  const maxK = target.length - ti;
  for (let k = 1; k <= maxK; k++) {
    const align = ti + k;
    if (align >= target.length) break;
    if (typed[ui] !== target[align]) continue;
    if (typed.slice(ui + 1) === target.slice(align + 1)) return k;
  }
  return 0;
}

/** Smallest m≥1 such that typed[ui+m]===target[ti] (inserted run is typed.slice(ui, ui+m)). */
function insertionLenUntilNextTargetMatch(target: string, typed: string, ti: number, ui: number): number {
  const maxM = typed.length - ui - 1;
  for (let m = 1; m <= maxM; m++) {
    if (typed[ui + m] === target[ti]) return m;
  }
  return 0;
}

function classifyWordErrors(
  target: string,
  typed: string,
  lastWasPause: boolean,
  /** Tail target chars only count as early-space omission when user committed the word with space. */
  tailOmissionForEarlySpace = false
): WordErrorEvent[] {
  const events: WordErrorEvent[] = [];
  let ti = 0; // target index
  let ui = 0; // typed (user) index
  let eventOrder = 0;

  while (ti < target.length && ui < typed.length) {
    // Match
    if (target[ti] === typed[ui]) {
      ti++;
      ui++;
      continue;
    }

    // Check transposition: typed[ui]==target[ti+1] && typed[ui+1]==target[ti]
    if (
      ti + 1 < target.length &&
      ui + 1 < typed.length &&
      typed[ui] === target[ti + 1] &&
      typed[ui + 1] === target[ti]
    ) {
      const pair1 = buildKeyPairDetail(target[ti], typed[ui]);
      const pair2 = buildKeyPairDetail(target[ti + 1], typed[ui + 1]);
      events.push({
        error_type: "transposition",
        event_order: eventOrder++,
        corrected: false,
        char_index_start: ti,
        char_index_end: ti + 1,
        position_in_word: positionInWord(ti, ti + 1, target.length),
        expected_text: target[ti] + target[ti + 1],
        actual_text: typed[ui] + typed[ui + 1],
        pause_ms: null,
        preceded_by_pause: eventOrder === 1 && lastWasPause,
        details_jsonb: { pairs: [pair1, pair2] },
      });
      ti += 2;
      ui += 2;
      continue;
    }

    // Grouped omission: remainder of typed matches target after skipping k≥1 chars (no “inserted” char)
    const shiftK = omissionSuffixShiftLen(target, typed, ti, ui);
    if (shiftK > 0) {
      const omitStart = ti;
      const omitEnd = ti + shiftK - 1;
      const omittedChars = [];
      for (let ci = omitStart; ci <= omitEnd; ci++) {
        const ch = target[ci];
        const ki = getKeyInfo(ch);
        omittedChars.push({
          expected: ch,
          keyboard_row_expected: ki?.row ?? ("home" as const),
          finger_expected: ki?.finger ?? ("left_index" as const),
        });
      }
      events.push({
        error_type: "omission",
        event_order: eventOrder++,
        corrected: false,
        char_index_start: omitStart,
        char_index_end: omitEnd,
        position_in_word: positionInWord(omitStart, omitEnd, target.length),
        expected_text: target.slice(omitStart, omitEnd + 1),
        actual_text: "",
        pause_ms: null,
        preceded_by_pause: eventOrder === 1 && lastWasPause,
        details_jsonb: { omitted_chars: omittedChars },
      });
      ti += shiftK;
      continue;
    }

    // Insertion: extras until next typed char matches target[ti]; then main loop consumes that match.
    const insLen = insertionLenUntilNextTargetMatch(target, typed, ti, ui);
    if (insLen > 0) {
      const insText = typed.slice(ui, ui + insLen);
      const inserted_chars = [];
      for (let ii = 0; ii < insText.length; ii++) {
        const ch = insText[ii]!;
        const ki = getKeyInfo(ch);
        inserted_chars.push({
          actual: ch,
          keyboard_row_actual: ki?.row ?? ("home" as const),
          finger_actual: ki?.finger ?? ("left_index" as const),
        });
      }
      const posAfter = Math.max(0, ti - 1);
      events.push({
        error_type: "insertion",
        event_order: eventOrder++,
        corrected: false,
        char_index_start: ti,
        char_index_end: ti,
        position_in_word: positionInWord(posAfter, posAfter, target.length),
        expected_text: "",
        actual_text: insText,
        pause_ms: null,
        preceded_by_pause: eventOrder === 1 && lastWasPause,
        details_jsonb: { inserted_chars },
      });
      ui += insLen;
      continue;
    }

    // Check omission: target char missing, typed chars shifted left
    // Need ≥2 shifted matches, or 1 if fewer than 2 chars remain
    if (ti + 1 < target.length) {
      const remaining = target.length - (ti + 1);
      const requiredMatches = remaining >= 2 ? 2 : 1;
      let matches = 0;
      for (let k = 0; k < remaining && k + ui < typed.length; k++) {
        if (target[ti + 1 + k] === typed[ui + k]) {
          matches++;
          if (matches >= requiredMatches) break;
        } else {
          break;
        }
      }
      if (matches >= requiredMatches) {
        // Group consecutive omissions
        let omitEnd = ti;
        while (
          omitEnd + 1 < target.length &&
          ui < typed.length &&
          target[omitEnd + 1] !== typed[ui]
        ) {
          omitEnd++;
        }
        // Actually only skip the single char confirmed as omitted
        const ch = target[ti];
        const ki = getKeyInfo(ch);
        events.push({
          error_type: "omission",
          event_order: eventOrder++,
          corrected: false,
          char_index_start: ti,
          char_index_end: ti,
          position_in_word: positionInWord(ti, ti, target.length),
          expected_text: ch,
          actual_text: "",
          pause_ms: null,
          preceded_by_pause: eventOrder === 1 && lastWasPause,
          details_jsonb: {
            omitted_chars: [{
              expected: ch,
              keyboard_row_expected: ki?.row ?? "home" as const,
              finger_expected: ki?.finger ?? "left_index" as const,
            }],
          },
        });
        ti++; // skip the omitted target char, don't advance ui
        continue;
      }
    }

    // Substitution — collect consecutive
    const subStart = ti;
    const pairs = [];
    while (
      ti < target.length &&
      ui < typed.length &&
      target[ti] !== typed[ui]
    ) {
      // Before grouping, check if next two chars are a transposition — don't merge
      if (
        ti + 1 < target.length &&
        ui + 1 < typed.length &&
        typed[ui] === target[ti + 1] &&
        typed[ui + 1] === target[ti]
      ) {
        break;
      }
      pairs.push(buildKeyPairDetail(target[ti], typed[ui]));
      ti++;
      ui++;
    }
    if (pairs.length > 0) {
      const subEnd = subStart + pairs.length - 1;
      events.push({
        error_type: "substitution",
        event_order: eventOrder++,
        corrected: false,
        char_index_start: subStart,
        char_index_end: subEnd,
        position_in_word: positionInWord(subStart, subEnd, target.length),
        expected_text: target.slice(subStart, subEnd + 1),
        actual_text: pairs.map((p) => p.actual).join(""),
        pause_ms: null,
        preceded_by_pause: eventOrder === 1 && lastWasPause,
        details_jsonb: { pairs },
      });
    }
  }

  // Remaining target chars = omission only when this snapshot is from a space commit (early advance).
  // Live/WIP input (e.g. "peor" for "people") must not add a fake tail omission for "le".
  if (ti < target.length && tailOmissionForEarlySpace) {
    const omitStart = ti;
    const omitEnd = target.length - 1;
    const omittedChars = [];
    for (let ci = omitStart; ci <= omitEnd; ci++) {
      const ch = target[ci];
      const ki = getKeyInfo(ch);
      omittedChars.push({
        expected: ch,
        keyboard_row_expected: ki?.row ?? ("home" as const),
        finger_expected: ki?.finger ?? ("left_index" as const),
      });
    }
    events.push({
      error_type: "omission",
      event_order: eventOrder++,
      corrected: false,
      char_index_start: omitStart,
      char_index_end: omitEnd,
      position_in_word: positionInWord(omitStart, omitEnd, target.length),
      expected_text: target.slice(omitStart),
      actual_text: "",
      pause_ms: null,
      preceded_by_pause: eventOrder === 1 && lastWasPause,
      details_jsonb: {
        omitted_chars: omittedChars,
        ended_by_space: true,
      },
    });
  }

  // Remaining typed chars = insertion (extra chars past the word)
  if (ui < typed.length) {
    const insertedChars = [];
    for (let ci = ui; ci < typed.length; ci++) {
      const ch = typed[ci];
      const ki = getKeyInfo(ch);
      insertedChars.push({
        actual: ch,
        keyboard_row_actual: ki?.row ?? ("home" as const),
        finger_actual: ki?.finger ?? ("left_index" as const),
      });
    }
    events.push({
      error_type: "insertion",
      event_order: eventOrder++,
      corrected: false,
      char_index_start: target.length > 0 ? target.length - 1 : 0,
      char_index_end: target.length > 0 ? target.length - 1 : 0,
      position_in_word: "end",
      expected_text: "",
      actual_text: typed.slice(ui),
      pause_ms: null,
      preceded_by_pause: eventOrder === 1 && lastWasPause,
      details_jsonb: {
        inserted_chars: insertedChars,
        trailing_insertion: true,
      },
    });
  }

  return events;
}

// ── The hook ──

export type ErrorCollectorFinalizeOptions = {
  /** When `time`, omit the last touched word if it was never committed with space (timer cut-off mid-word). */
  gameMode?: "time" | "words" | "quote";
};

export type ErrorCollectorAPI = {
  onInputChange: (
    prevInput: string,
    nextInput: string,
    displayText: string,
    alignment: AlignmentResult,
    gameStartPerfTime: number
  ) => void;
  finalize: (
    displayText: string,
    rawInput: string,
    alignment: AlignmentResult,
    gameStartPerfTime: number,
    options?: ErrorCollectorFinalizeOptions
  ) => WordMistake[];
  reset: () => void;
};

export function useErrorCollector(): ErrorCollectorAPI {
  const wordStatesRef = useRef<Map<number, WordState>>(new Map());
  const lastKeystrokeTimeRef = useRef<number>(0);
  const maxWordIndexTouchedRef = useRef<number>(0);

  function getOrCreateWordState(wordIndex: number, targetWord: string): WordState {
    const map = wordStatesRef.current;
    let state = map.get(wordIndex);
    if (!state) {
      state = {
        wordIndex,
        targetWord,
        snapshotWord: null,
        typedLength: 0,
        wasCorrect: true,
        isBackspacing: false,
        errorEvents: [],
        archivedErrorEvents: [],
        suppressForwardErrorMerges: false,
        pauseEvents: [],
        backspaceCount: 0,
        correctionCount: 0,
        startTimeMs: null,
        endTimeMs: null,
        pauseCount: 0,
        maxPauseMs: 0,
      };
      map.set(wordIndex, state);
    }
    return state;
  }

  const onInputChange = useCallback((
    prevInput: string,
    nextInput: string,
    displayText: string,
    alignment: AlignmentResult,
    gameStartPerfTime: number
  ) => {
    const now = performance.now();
    const promptWords = splitPromptWords(displayText);
    if (promptWords.length === 0) return;

    const isForward = nextInput.length > prevInput.length;
    const isBackspace = nextInput.length < prevInput.length;
    const spaceJustPressed = isForward && nextInput.endsWith(" ") && !prevInput.endsWith(" ");

    const currentWordIdx = getCurrentWordIndex(alignment, displayText, spaceJustPressed);
    if (currentWordIdx > maxWordIndexTouchedRef.current) {
      maxWordIndexTouchedRef.current = currentWordIdx;
    }

    const pw = promptWords[currentWordIdx];
    if (!pw) return;

    const ws = getOrCreateWordState(currentWordIdx, pw.word);
    const elapsedMs = gameStartPerfTime > 0 ? Math.round(now - gameStartPerfTime) : 0;

    // ── Timing: first char of word ──
    if (isForward && !spaceJustPressed) {
      const wordInfo = getWordInput(alignment, displayText, nextInput, pw.promptStart, pw.promptEnd);
      if (wordInfo.typed.length > 0 && ws.startTimeMs === null) {
        ws.startTimeMs = elapsedMs;
      }
    }

    // ── Pause detection (forward typing, non-space) ──
    if (isForward && !spaceJustPressed && lastKeystrokeTimeRef.current > 0) {
      const gap = now - lastKeystrokeTimeRef.current;
      if (gap > PAUSE_GAP_THRESHOLD_MS && gap <= 2000) {
        const wordInfo = getWordInput(alignment, displayText, nextInput, pw.promptStart, pw.promptEnd);
        const pauseCharIdx = Math.max(0, wordInfo.correctPrefixLen - 1);
        const afterChar = pauseCharIdx < pw.word.length ? pw.word[pauseCharIdx] : "";
        const beforeExpectedIdx = pauseCharIdx + 1;
        const beforeExpected = beforeExpectedIdx < pw.word.length ? pw.word[beforeExpectedIdx] : "";

        ws.pauseEvents.push({
          error_type: "pause",
          event_order: 0, // re-numbered at finalize
          corrected: null,
          char_index_start: beforeExpectedIdx < pw.word.length ? beforeExpectedIdx : pauseCharIdx,
          char_index_end: beforeExpectedIdx < pw.word.length ? beforeExpectedIdx : pauseCharIdx,
          position_in_word: positionInWord(
            beforeExpectedIdx < pw.word.length ? beforeExpectedIdx : pauseCharIdx,
            beforeExpectedIdx < pw.word.length ? beforeExpectedIdx : pauseCharIdx,
            pw.word.length
          ),
          expected_text: "",
          actual_text: "",
          pause_ms: Math.round(gap),
          preceded_by_pause: false,
          details_jsonb: {
            after_char: afterChar,
            before_expected_char: beforeExpected,
          },
        });
        ws.pauseCount++;
        if (Math.round(gap) > ws.maxPauseMs) {
          ws.maxPauseMs = Math.round(gap);
        }
      }
    }

    if (isForward) {
      lastKeystrokeTimeRef.current = now;
    }

    // ── Space press: snapshot + classify errors ──
    if (spaceJustPressed) {
      ws.endTimeMs = elapsedMs;
      const wordInfo = getWordInput(alignment, displayText, nextInput, pw.promptStart, pw.promptEnd);
      ws.snapshotWord = wordInfo.typed;

      const lastPauseWas = ws.pauseEvents.length > 0;
      const nextErrors = classifyWordErrors(pw.word, wordInfo.typed, lastPauseWas, true);
      if (wordInfo.typed === pw.word && nextErrors.length === 0 && ws.errorEvents.length > 0) {
        ws.errorEvents = ws.errorEvents;
      } else if (ws.suppressForwardErrorMerges && ws.errorEvents.length > 0) {
        ws.errorEvents = ws.errorEvents;
      } else if (wordInfo.typed.length === pw.word.length && wordInfo.typed !== pw.word) {
        // Full-length wrong word: one parse of the committed string (avoids "nw" omission + "nwe" transposition).
        ws.errorEvents = nextErrors;
      } else if (ws.errorEvents.length > 0) {
        ws.errorEvents = dedupeMergeWordErrorEvents(ws.errorEvents, nextErrors);
      } else {
        ws.errorEvents = nextErrors;
      }
      return;
    }

    // ── Backspace handling ──
    if (isBackspace) {
      ws.backspaceCount++;
      ws.isBackspacing = true;

      const wordInfo = getWordInput(alignment, displayText, nextInput, pw.promptStart, pw.promptEnd);
      const isCorrectNow = wordInfo.typed.length === 0 ||
        (wordInfo.correctPrefixLen === wordInfo.typed.length && !wordInfo.hasExtras);

      if (isCorrectNow) {
        ws.suppressForwardErrorMerges = false;
        if (ws.errorEvents.length > 0) {
          ws.archivedErrorEvents.push(...ws.errorEvents);
          ws.errorEvents = [];
        }
        if (!ws.wasCorrect) {
          ws.correctionCount++;
        }
        ws.isBackspacing = false;
        ws.wasCorrect = true;
        ws.snapshotWord = wordInfo.typed;
        // Do not re-classify here: classify("target", partial) would drop substitution (e.g. tr→t) or clear on think.
      } else {
        ws.snapshotWord = wordInfo.typed;
        ws.suppressForwardErrorMerges = wordInfo.correctPrefixLen > 0;
        const alignPrev = computeAlignment(displayText, prevInput);
        const wPrev = getWordInput(alignPrev, displayText, prevInput, pw.promptStart, pw.promptEnd);
        const snap = classifyWordErrors(pw.word, wPrev.typed, false, false);
        // Partial recovery (still wrong but correct prefix): use only the pre-backspace diff, not a merge
        // with earlier partial strings (e.g. "wr" substitution + "wro" transposition → keep transposition only).
        if (ws.suppressForwardErrorMerges) {
          ws.errorEvents = snap;
        } else {
          ws.errorEvents = dedupeMergeWordErrorEvents(ws.errorEvents, snap);
        }
      }

      if (wordInfo.typed.length === 0) {
        ws.startTimeMs = null;
        ws.snapshotWord = null;
        ws.errorEvents = [];
        ws.archivedErrorEvents = [];
        ws.suppressForwardErrorMerges = false;
      }
      return;
    }

    // ── Forward typing: track correct/incorrect state ──
    if (!isForward) return;

    const wordInfo = getWordInput(alignment, displayText, nextInput, pw.promptStart, pw.promptEnd);
    const forwardCorrect =
      wordInfo.correctPrefixLen === wordInfo.typed.length && !wordInfo.hasExtras;

    if (forwardCorrect) {
      ws.errorEvents = [];
      ws.suppressForwardErrorMerges = false;
    } else if (ws.suppressForwardErrorMerges) {
      ws.snapshotWord = wordInfo.typed;
    } else {
      ws.snapshotWord = wordInfo.typed;
      const fresh = classifyWordErrors(pw.word, wordInfo.typed, false, false);
      if (wordInfo.typed.length === pw.word.length) {
        ws.errorEvents = fresh;
      } else {
        ws.errorEvents = dedupeMergeWordErrorEvents(ws.errorEvents, fresh);
      }
    }

    if (ws.isBackspacing && forwardCorrect) {
      ws.isBackspacing = false;
      ws.wasCorrect = true;
    } else if (ws.isBackspacing) {
      // still backspacing mode, don't update wasCorrect
    } else if (forwardCorrect) {
      ws.wasCorrect = true;
    } else {
      ws.wasCorrect = false;
    }

    ws.typedLength = wordInfo.typed.length;
  }, []);

  const finalize = useCallback((
    displayText: string,
    rawInput: string,
    alignment: AlignmentResult,
    gameStartPerfTime: number,
    options?: ErrorCollectorFinalizeOptions
  ): WordMistake[] => {
    const promptWords = splitPromptWords(displayText);
    const maxWordTouched = maxWordIndexTouchedRef.current;
    const endTime = gameStartPerfTime > 0 ? Math.round(performance.now() - gameStartPerfTime) : 0;
    const results: WordMistake[] = [];

    for (let i = 0; i < promptWords.length; i++) {
      const pw = promptWords[i];
      const ws = wordStatesRef.current.get(i);
      const wordInfo = getWordInput(alignment, displayText, rawInput, pw.promptStart, pw.promptEnd);

      // Time mode: timer can stop mid-word — omit that word if user never hit space to commit it
      // (avoids bogus substitution/omission on partial input like "nr" for "new").
      const previewTyped = ws?.snapshotWord ?? wordInfo.typed;
      if (
        options?.gameMode === "time" &&
        i === maxWordTouched &&
        ws?.endTimeMs == null &&
        (previewTyped !== pw.word || wordInfo.hasExtras)
      ) {
        continue;
      }

      // Use snapshot if available, otherwise take final alignment
      const finalWord = previewTyped;

      // For the last word (no space pressed), snapshot now
      if (ws && ws.snapshotWord === null && wordInfo.typed.length > 0) {
        ws.snapshotWord = wordInfo.typed;
        if (wordInfo.typed !== pw.word && !ws.suppressForwardErrorMerges) {
          ws.errorEvents = classifyWordErrors(pw.word, wordInfo.typed, false);
        }
      }

      let finalStatus: FinalStatus;
      if (finalWord === pw.word) {
        finalStatus = "corrected";
      } else if (finalWord.length === 0 && i <= maxWordTouched) {
        finalStatus = "skipped";
      } else if (finalWord.length === 0) {
        continue;
      } else if (wordInfo.hasExtras) {
        finalStatus = "extra";
      } else {
        finalStatus = "incorrect";
      }

      const hadInteraction = ws != null || finalWord.length > 0;
      if (!hadInteraction) continue;

      const startMs = ws?.startTimeMs ?? null;
      let endMs = ws?.endTimeMs ?? null;

      if (endMs === null && finalWord.length > 0 && i === maxWordTouched) {
        endMs = endTime;
      }

      const durationMs = startMs !== null && endMs !== null && endMs >= startMs
        ? endMs - startMs
        : null;

      // Merge pause events + error events, re-number event_order
      const allEvents: WordErrorEvent[] = [];
      const pauses = ws?.pauseEvents ?? [];
      const errors = [...(ws?.archivedErrorEvents ?? []), ...(ws?.errorEvents ?? [])];

      // Interleave: pauses first, then errors, renumber
      for (const p of pauses) allEvents.push(p);
      for (const e of errors) allEvents.push(e);
      for (let ei = 0; ei < allEvents.length; ei++) {
        (allEvents[ei] as { event_order: number }).event_order = ei;
      }

      // Mark corrected on error events if word ended up correct
      if (finalWord === pw.word) {
        for (const ev of allEvents) {
          if (ev.error_type !== "pause") {
            (ev as { corrected: boolean | null }).corrected = true;
          }
        }
      }

      const mistake: WordMistake = {
        word_index: i,
        words_reached_at_end: maxWordTouched,
        target_word: pw.word,
        final_word: finalWord,
        final_status: finalStatus,
        correction_count: ws?.correctionCount ?? 0,
        backspace_count: ws?.backspaceCount ?? 0,
        word_length: pw.word.length,
        contains_repeat_pattern: hasRepeatPattern(pw.word),
        contains_focus_bigram: hasFocusBigram(pw.word),
        contains_focus_trigram: hasFocusTrigram(pw.word),
        start_time_ms: startMs,
        end_time_ms: endMs,
        duration_ms: durationMs,
        pause_count: ws?.pauseCount ?? 0,
        max_pause_ms: ws?.maxPauseMs ?? 0,
        error_count: errors.length,
        word_error_events: allEvents,
      };

      results.push(mistake);
    }

    return results;
  }, []);

  const reset = useCallback(() => {
    wordStatesRef.current = new Map();
    lastKeystrokeTimeRef.current = 0;
    maxWordIndexTouchedRef.current = 0;
  }, []);

  return useMemo(
    () => ({ onInputChange, finalize, reset }),
    [onInputChange, finalize, reset]
  );
}
