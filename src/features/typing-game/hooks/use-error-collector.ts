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

const PAUSE_GAP_THRESHOLD_MS = 750;


// Internal per-word state kept while the user is typing. This is stored in a
// ref-backed Map so the collector can update detailed telemetry without causing
// the typing UI to re-render on every small analytics change.
type WordState = {
  // Position of this word inside the prompt, starting from 0.
  wordIndex: number;
  // Correct word from displayText.
  targetWord: string;
  // Latest typed version of this word captured by the collector.
  snapshotWord: string | null;
  // Length of the typed word from the previous update.
  typedLength: number;
  // Whether the word was previously in a correct state.
  wasCorrect: boolean;
  // True while the user is correcting the word with backspace.
  isBackspacing: boolean;
  // Current unresolved error events for this word.
  errorEvents: WordErrorEvent[];
  // Older errors that were made and then corrected.
  archivedErrorEvents: WordErrorEvent[];
  // Prevents old forward-typing snapshots from being merged after certain
  // backspace flows where replacement would be more accurate.
  suppressForwardErrorMerges: boolean;
  // Pause events are stored separately because pauses can happen even when the
  // final typed word is correct.
  pauseEvents: WordErrorEvent[];
  // Number of backspace key effects recorded while this word is active.
  backspaceCount: number;
  // Number of times the word moved from incorrect back to correct.
  correctionCount: number;
  // Milliseconds from game start when the user first typed in this word.
  startTimeMs: number | null;
  // Milliseconds from game start when the user left/completed this word.
  endTimeMs: number | null;
  // Count of pauses above PAUSE_GAP_THRESHOLD_MS.
  pauseCount: number;
  // Longest counted pause in this word.
  maxPauseMs: number;
};


// Merge key used when the same mistake appears in repeated snapshots of the
// same word. This prevents the collector from saving duplicate error events.
function wordErrorEventMergeKey(e: WordErrorEvent): string {
  // This key ignores fields like event_order, because the same logical mistake
  // can be observed again as the user continues typing the word.
  return `${e.error_type}:${e.char_index_start}:${e.char_index_end}:${e.expected_text}:${e.actual_text}`;
}

// Exact key used at finalisation time. It includes more fields than the merge
// key because final output should keep genuinely different events separate.
function wordErrorEventExactKey(e: WordErrorEvent): string {
  return [
    e.error_type,
    e.char_index_start,
    e.char_index_end,
    e.position_in_word,
    e.expected_text,
    e.actual_text,
    e.pause_ms ?? "",
    e.preceded_by_pause ? "1" : "0",
    e.corrected === null ? "null" : e.corrected ? "1" : "0",
    JSON.stringify(e.details_jsonb ?? null),
  ].join("|");
}

// Combines old and new word error snapshots while avoiding duplicate events.
function dedupeMergeWordErrorEvents(existing: WordErrorEvent[], incoming: WordErrorEvent[]): WordErrorEvent[] {
  // Existing events are kept first so their original order is preserved.
  const seen = new Set(existing.map(wordErrorEventMergeKey));
  const out = [...existing];
  for (const ev of incoming) {
    const k = wordErrorEventMergeKey(ev);
    // Only append genuinely new logical mistakes.
    if (!seen.has(k)) {
      seen.add(k);
      out.push(ev);
    }
  }
  return out;
}

// Checks whether two error events touch the same character range.
function rangesOverlap(a: WordErrorEvent, b: WordErrorEvent): boolean {
  return a.char_index_start <= b.char_index_end && b.char_index_start <= a.char_index_end;
}

// If a final omission exists, overlapping active substitutions are removed so
// one missing character is not reported as two different unresolved errors.
function normalizeFinalWordErrors(events: WordErrorEvent[]): WordErrorEvent[] {
  const activeOmissions = events.filter(
    (e) => e.error_type === "omission" && e.corrected !== true
  );
  if (activeOmissions.length === 0) return events;

  return events.filter((event) => {
    if (event.error_type !== "substitution" || event.corrected === true) return true;
    return !activeOmissions.some((omission) => rangesOverlap(event, omission));
  });
}

// Converts a character range into a simple position label. This is useful later
// for analytics like "errors at the end of words".
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

// A target word plus its start/end character indexes inside the full prompt.
type PromptWord = {
  word: string;
  promptStart: number;
  promptEnd: number;
};

// Splits the prompt into words while preserving each word's character indexes.
function splitPromptWords(displayText: string): PromptWord[] {
  const result: PromptWord[] = [];
  let i = 0;
  while (i < displayText.length) {
    // Skip spaces between words.
    if (displayText[i] === " ") { i++; continue; }
    // `start` is the target-text index of the first character in this word.
    const start = i;
    // Move forward until the next space or the end of the prompt.
    while (i < displayText.length && displayText[i] !== " ") i++;
    // `promptEnd` is exclusive, so the word is displayText.slice(start, i).
    result.push({ word: displayText.slice(start, i), promptStart: start, promptEnd: i });
  }
  return result;
}

// Finds which prompt word the cursor currently belongs to. If the user just
// pressed space, the completed word is treated as the current word for snapshot
// purposes.
function getCurrentWordIndex(
  alignment: AlignmentResult,
  displayText: string,
  spaceJustPressed: boolean
): number {
  // Convert the full target text into word ranges so we can map the prompt cursor
  // to a word index.
  const words = splitPromptWords(displayText);
  if (words.length === 0) return 0;
  // alignment.promptCursor is the current target-text position reached by the
  // typed input.
  const cursor = alignment.promptCursor;
  if (spaceJustPressed && cursor > 0) {
    // When a space has just been pressed, the prompt cursor is already after the
    // word boundary, so scan backwards to return the word that was just left.
    for (let i = words.length - 1; i >= 0; i--) {
      if (cursor > words[i].promptStart) return i;
    }
  }
  // Normal case: find the first word whose end is at or after the cursor.
  for (let i = 0; i < words.length; i++) {
    if (cursor <= words[i].promptEnd) return i;
  }
  // If the cursor is beyond all word ranges, use the last word.
  return Math.max(0, words.length - 1);
}

// Extracts the user's typed version of one target word from the full alignment.
// It also reports how much of the word is currently a correct prefix and whether
// extra characters exist in that word.
function getWordInput(
  alignment: AlignmentResult,
  displayText: string,
  rawInput: string,
  promptStart: number,
  promptEnd: number
): { typed: string; correctPrefixLen: number; hasExtras: boolean } {
  // Number of correctly typed characters from the start of this word before the
  // first wrong/skipped/extra break.
  let correctPrefixLen = 0;
  let prefixBroken = false;
  // True if this word contains extra typed characters.
  let hasExtras = false;
  // The first rawInput index used by prompt characters for this word.
  let minInputIdx = Infinity;
  // The last rawInput index used by prompt characters for this word.
  let maxPromptInputIdx = -1;

  // First pass: find the rawInput range occupied by target characters in this
  // word. This uses alignment cells because rawInput and displayText may be
  // shifted by skipped or extra characters.
  for (const cell of alignment.cells) {
    if (cell.type === "prompt" && cell.index >= promptStart && cell.index < promptEnd && cell.inputIndex != null) {
      minInputIdx = Math.min(minInputIdx, cell.inputIndex);
      maxPromptInputIdx = Math.max(maxPromptInputIdx, cell.inputIndex);
    }
  }

  // Second pass: count the correct prefix and detect extra cells inside the word.
  for (const cell of alignment.cells) {
    if (cell.type === "prompt" && cell.index >= promptStart && cell.index < promptEnd) {
      if (cell.inputIndex != null) {
        // The prefix only grows while target cells are correct and no earlier
        // target cell has broken the prefix.
        if (!prefixBroken && cell.status === "correct") {
          correctPrefixLen++;
        } else {
          // Once a wrong/skipped target cell appears, later correct letters are
          // not part of the correct prefix.
          prefixBroken = true;
        }
      }
    } else if (
      cell.type === "extra" &&
      minInputIdx !== Infinity &&
      cell.inputIndex >= minInputIdx &&
      cell.inputIndex <= maxPromptInputIdx
    ) {
      // Extra input between the first and last prompt character belongs to this
      // word, for example "txwo" while typing "two".
      hasExtras = true;
    }
  }

  let typed = "";
  if (minInputIdx !== Infinity) {
    // Extract the raw typed word by slicing rawInput from the first character in
    // the word until the next typed space.
    const spaceAfter = rawInput.indexOf(" ", minInputIdx);
    const endExclusive = spaceAfter === -1 ? rawInput.length : spaceAfter;
    typed = rawInput.slice(minInputIdx, endExclusive);
    if (maxPromptInputIdx >= 0) {
      for (const cell of alignment.cells) {
        // Extra input after the last matched prompt character but before the
        // space also belongs to this word, for example "twoe ".
        if (cell.type === "extra" && cell.inputIndex > maxPromptInputIdx && cell.inputIndex < endExclusive) {
          hasExtras = true;
        }
      }
    }
  }

  return { typed, correctPrefixLen, hasExtras };
}


// Look-ahead helper for omission detection. It checks whether skipping one or
// more target characters makes the remaining typed suffix line up again.
function omissionSuffixShiftLen(target: string, typed: string, ti: number, ui: number): number {
  // If either index is already outside its word, no middle omission can be found.
  if (ui >= typed.length || ti >= target.length) return 0;
  // Try skipping 1, then 2, then more target characters.
  const maxK = target.length - ti;
  for (let k = 1; k <= maxK; k++) {
    // `align` is the target index that would line up with typed[ui] after
    // skipping k target characters.
    const align = ti + k;
    if (align >= target.length) break;
    // If the current typed character does not match the later target character,
    // this skip length is not a valid omission.
    if (typed[ui] !== target[align]) continue;
    // Strict omission: after the skipped character(s), the rest of both words
    // must match exactly.
    if (typed.slice(ui + 1) === target.slice(align + 1)) return k;
  }
  return 0;
}

// Look-ahead helper for insertion detection. If later typed characters match the
// current target character, the earlier typed characters are treated as inserted.
function insertionLenUntilNextTargetMatch(target: string, typed: string, ti: number, ui: number): number {
  // Try skipping one or more typed characters until a later typed character
  // matches the current target character.
  const maxM = typed.length - ui - 1;
  for (let m = 1; m <= maxM; m++) {
    // If typed[ui + m] matches target[ti], then typed[ui..ui+m) is inserted.
    if (typed[ui + m] === target[ti]) return m;
  }
  return 0;
}

// Rule-based word error classifier. It uses two indexes: `ti` for the target
// word and `ui` for the typed word. It is inspired by edit-distance categories,
// but it returns readable telemetry events instead of only a numeric distance.
function classifyWordErrors(
  target: string,
  typed: string,
  lastWasPause: boolean,
  tailOmissionForEarlySpace = false
): WordErrorEvent[] {
  // This array is the final list of classified error objects for one word.
  const events: WordErrorEvent[] = [];
  // `ti` means target index. `ui` means user input index.
  let ti = 0; 
  let ui = 0; 
  // eventOrder is assigned in the order the classifier discovers events.
  let eventOrder = 0;

  // Compare the two words from left to right.
  while (ti < target.length && ui < typed.length) {
    if (target[ti] === typed[ui]) {
      // Matching characters are correct, so no error event is created.
      ti++;
      ui++;
      continue;
    }

    // Transposition: two neighbouring characters were typed in the opposite
    // order, such as "teh" instead of "the".
    if (
      ti + 1 < target.length &&
      ui + 1 < typed.length &&
      typed[ui] === target[ti + 1] &&
      typed[ui + 1] === target[ti]
    ) {
      // Add keyboard metadata for both swapped characters.
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
      // A transposition consumes two target characters and two typed characters.
      ti += 2;
      ui += 2;
      continue;
    }

    // Try strict omission before insertion/substitution. If skipping target
    // characters makes the remaining suffix match, those skipped target
    // characters were omitted.
    const shiftK = omissionSuffixShiftLen(target, typed, ti, ui);
    if (shiftK > 0) {
      // Omission: one or more expected characters are missing and the following
      // typed characters line up with later target characters.
      const omitStart = ti;
      const omitEnd = ti + shiftK - 1;
      const omittedChars = [];
      for (let ci = omitStart; ci <= omitEnd; ci++) {
        const ch = target[ci];
        // Add row/finger data for the missing expected character.
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
      // Move only the target index. The typed character at ui still needs to be
      // compared against the later target character it lined up with.
      ti += shiftK;
      continue;
    }

    // Try insertion next. If skipping typed characters makes the current target
    // character line up again, those skipped typed characters are insertions.
    const insLen = insertionLenUntilNextTargetMatch(target, typed, ti, ui);
    if (insLen > 0) {
      // Insertion: extra typed character(s) appear before the next expected
      // target character.
      const insText = typed.slice(ui, ui + insLen);
      const inserted_chars = [];
      for (let ii = 0; ii < insText.length; ii++) {
        const ch = insText[ii]!;
        // Add row/finger data for the extra typed character.
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
      // Move only the typed index because the current target character has not
      // been consumed yet.
      ui += insLen;
      continue;
    }

    if (ti + 1 < target.length) {
      // Extra omission fallback for cases where a skipped character lets the
      // next target characters line up.
      const remaining = target.length - (ti + 1);
      // If enough characters remain, require two consecutive matches after the
      // possible omission. Near the end, one match is enough because only one
      // character remains.
      const requiredMatches = remaining >= 2 ? 2 : 1;
      let matches = 0;
      for (let k = 0; k < remaining && k + ui < typed.length; k++) {
        // Compare the next target character(s) with the current typed suffix.
        if (target[ti + 1 + k] === typed[ui + k]) {
          matches++;
          if (matches >= requiredMatches) break;
        } else {
          break;
        }
      }
      if (matches >= requiredMatches) {
        // Local evidence suggests target[ti] was skipped.
        let omitEnd = ti;
        while (
          omitEnd + 1 < target.length &&
          ui < typed.length &&
          target[omitEnd + 1] !== typed[ui]
        ) {
          // Advance omitEnd until the later target character matches typed[ui].
          omitEnd++;
        }
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
        // Consume the omitted target character only.
        ti++; 
        continue;
      }
    }

    // If no clearer shifted alignment was found, classify the mismatch as a
    // substitution sequence.
    const subStart = ti;
    const pairs = [];
    // Substitution: target and typed characters do not match and no clearer
    // insertion/omission/transposition rule applies.
    while (
      ti < target.length &&
      ui < typed.length &&
      target[ti] !== typed[ui]
    ) {
      // Stop before a transposition so it can be classified by the next loop
      // iteration instead of being swallowed by a substitution sequence.
      if (
        ti + 1 < target.length &&
        ui + 1 < typed.length &&
        typed[ui] === target[ti + 1] &&
        typed[ui + 1] === target[ti]
      ) {
        break;
      }
      // Record expected/actual key detail for this substituted character.
      pairs.push(buildKeyPairDetail(target[ti], typed[ui]));
      // A substitution consumes one target character and one typed character.
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

  if (ti < target.length && tailOmissionForEarlySpace) {
    // If the word ended because of an early space, any remaining target
    // characters are saved as a tail omission.
    const omitStart = ti;
    const omitEnd = target.length - 1;
    const omittedChars = [];
    for (let ci = omitStart; ci <= omitEnd; ci++) {
      const ch = target[ci];
      // Store keyboard data for every character left out at the end of the word.
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

  if (ui < typed.length) {
    // Any remaining typed characters after the target is exhausted are trailing
    // insertions.
    const insertedChars = [];
    for (let ci = ui; ci < typed.length; ci++) {
      const ch = typed[ci];
      // Store keyboard data for every extra trailing character.
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


export type ErrorCollectorFinalizeOptions = {
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

// Main analytics hook for word-level telemetry. `useRef` is used because these
// analytics change very frequently and should not force the visible typing UI to
// re-render every time.
export function useErrorCollector(): ErrorCollectorAPI {
  const wordStatesRef = useRef<Map<number, WordState>>(new Map());
  // Timestamp of the previous forward keystroke, used to detect pauses.
  const lastKeystrokeTimeRef = useRef<number>(0);
  // Highest word index the user reached during the game.
  const maxWordIndexTouchedRef = useRef<number>(0);

  // Creates the WordState object the first time a word is touched.
  function getOrCreateWordState(wordIndex: number, targetWord: string): WordState {
    // The Map key is the word index. This makes lookup fast and keeps each
    // word's analytics separate.
    const map = wordStatesRef.current;
    let state = map.get(wordIndex);
    if (!state) {
      // First time this word is touched, initialise all counters and event lists.
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
      // Store the new state so later keystrokes for this word update the same
      // object.
      map.set(wordIndex, state);
    }
    return state;
  }

  // Called from the main typing hook on every input change. It records typing
  // direction, pauses, backspaces, correction behaviour and current error
  // snapshots for the active word.
  const onInputChange = useCallback((
    prevInput: string,
    nextInput: string,
    displayText: string,
    alignment: AlignmentResult,
    gameStartPerfTime: number
  ) => {
    // Use high-resolution browser time so pauses and word durations are accurate.
    const now = performance.now();
    // Split the current prompt so the collector can work at word level.
    const promptWords = splitPromptWords(displayText);
    if (promptWords.length === 0) return;

    // Compare input lengths to tell whether the user typed forward or backspaced.
    const isForward = nextInput.length > prevInput.length;
    const isBackspace = nextInput.length < prevInput.length;
    // A new trailing space means the user has just left the current word.
    const spaceJustPressed = isForward && nextInput.endsWith(" ") && !prevInput.endsWith(" ");

    // Use the alignment cursor to find which target word is currently active.
    const currentWordIdx = getCurrentWordIndex(alignment, displayText, spaceJustPressed);
    if (currentWordIdx > maxWordIndexTouchedRef.current) {
      maxWordIndexTouchedRef.current = currentWordIdx;
    }

    // Get the target word object for the active word index.
    const pw = promptWords[currentWordIdx];
    if (!pw) return;

    // Get or initialise the mutable WordState for this word.
    const ws = getOrCreateWordState(currentWordIdx, pw.word);
    // Convert absolute performance time into milliseconds since game start.
    const elapsedMs = gameStartPerfTime > 0 ? Math.round(now - gameStartPerfTime) : 0;

    if (isForward && !spaceJustPressed) {
      // First typed character in this word starts the word timer.
      const wordInfo = getWordInput(alignment, displayText, nextInput, pw.promptStart, pw.promptEnd);
      // Start time is recorded only once, when the word first receives typed text.
      if (wordInfo.typed.length > 0 && ws.startTimeMs === null) {
        ws.startTimeMs = elapsedMs;
      }
    }

    if (isForward && !spaceJustPressed && lastKeystrokeTimeRef.current > 0) {
      // Pause detection uses the time gap between consecutive forward
      // keystrokes. Long gaps are stored as pause events for later feedback.
      const gap = now - lastKeystrokeTimeRef.current;
      // Ignore gaps above 2 seconds because they are more likely distraction/AFK
      // than a typing hesitation.
      if (gap > PAUSE_GAP_THRESHOLD_MS && gap <= 2000) {
        const wordInfo = getWordInput(alignment, displayText, nextInput, pw.promptStart, pw.promptEnd);
        // The pause is attached to the transition after the current correct
        // prefix. Example: pause after "h" before expected "e".
        const pauseCharIdx = Math.max(0, wordInfo.correctPrefixLen - 1);
        const afterChar = pauseCharIdx < pw.word.length ? pw.word[pauseCharIdx] : "";
        const beforeExpectedIdx = pauseCharIdx + 1;
        const beforeExpected = beforeExpectedIdx < pw.word.length ? pw.word[beforeExpectedIdx] : "";

        ws.pauseEvents.push({
          error_type: "pause",
          event_order: 0, 
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
        // Keep quick aggregate counters on the word state.
        ws.pauseCount++;
        if (Math.round(gap) > ws.maxPauseMs) {
          ws.maxPauseMs = Math.round(gap);
        }
      }
    }

    if (isForward) {
      // Update the last forward keystroke time after pause detection.
      lastKeystrokeTimeRef.current = now;
    }

    if (spaceJustPressed) {
      // Space finalises a word snapshot. This captures the word exactly as the
      // user left it before moving to the next word.
      ws.endTimeMs = elapsedMs;
      const wordInfo = getWordInput(alignment, displayText, nextInput, pw.promptStart, pw.promptEnd);
      // Snapshot stores the user's exact typed version when they leave the word.
      ws.snapshotWord = wordInfo.typed;

      const lastPauseWas = ws.pauseEvents.length > 0;
      // Because the word was ended by space, remaining target letters can become
      // a tail omission with ended_by_space metadata.
      const nextErrors = classifyWordErrors(pw.word, wordInfo.typed, lastPauseWas, true);
      // On space, replace the current live errors with the final snapshot for
      // this word attempt.
      ws.errorEvents = nextErrors;
      ws.suppressForwardErrorMerges = false;
      return;
    }

    if (isBackspace) {
      // Backspace records correction behaviour. If the word returns to a correct
      // state, active errors are archived as corrected.
      ws.backspaceCount++;
      ws.isBackspacing = true;

      const wordInfo = getWordInput(alignment, displayText, nextInput, pw.promptStart, pw.promptEnd);
      // A word is currently correct if the typed text is empty, or the whole
      // typed text is a correct prefix and there are no extras.
      const isCorrectNow = wordInfo.typed.length === 0 ||
        (wordInfo.correctPrefixLen === wordInfo.typed.length && !wordInfo.hasExtras);

      if (isCorrectNow) {
        ws.suppressForwardErrorMerges = false;
        if (ws.errorEvents.length > 0) {
          // The current mistakes were fixed, so archive them as corrected rather
          // than deleting evidence that the mistake happened.
          ws.archivedErrorEvents.push(
            ...ws.errorEvents.map((event) =>
              event.error_type === "pause" ? event : { ...event, corrected: true }
            )
          );
          ws.errorEvents = [];
        }
        if (!ws.wasCorrect) {
          // Count one correction when the word returns from wrong to correct.
          ws.correctionCount++;
        }
        ws.isBackspacing = false;
        ws.wasCorrect = true;
        ws.snapshotWord = wordInfo.typed;
      } else {
        ws.snapshotWord = wordInfo.typed;
        // If the user has a correct prefix after backspacing, the next forward
        // typing should replace the active snapshot instead of merging old and
        // new errors too aggressively.
        ws.suppressForwardErrorMerges = wordInfo.correctPrefixLen > 0;
        // Classify the previous input snapshot because that is the state where
        // the backspace removed a character from.
        const alignPrev = computeAlignment(displayText, prevInput);
        const wPrev = getWordInput(alignPrev, displayText, prevInput, pw.promptStart, pw.promptEnd);
        const snap = classifyWordErrors(pw.word, wPrev.typed, false, false);
        if (ws.suppressForwardErrorMerges) {
          ws.errorEvents = snap;
        } else {
          ws.errorEvents = dedupeMergeWordErrorEvents(ws.errorEvents, snap);
        }
      }

      if (wordInfo.typed.length === 0) {
        // If the word has been fully cleared, reset its attempt state so a fresh
        // retype starts cleanly.
        ws.startTimeMs = null;
        ws.snapshotWord = null;
        ws.errorEvents = [];
        ws.archivedErrorEvents = [];
        ws.suppressForwardErrorMerges = false;
      }
      return;
    }

    if (!isForward) return;

    // Forward typing updates the current live error snapshot for the word.
    const wordInfo = getWordInput(alignment, displayText, nextInput, pw.promptStart, pw.promptEnd);
    // If the typed word equals the correct prefix length and there are no extras,
    // the current word is clean so far.
    const forwardCorrect =
      wordInfo.correctPrefixLen === wordInfo.typed.length && !wordInfo.hasExtras;

    if (forwardCorrect) {
      // A clean forward state has no active unresolved error snapshot.
      ws.errorEvents = [];
      ws.suppressForwardErrorMerges = false;
    } else if (ws.suppressForwardErrorMerges) {
      // Keep the new snapshot but do not merge errors yet, because the user is in
      // a correction flow after backspacing.
      ws.snapshotWord = wordInfo.typed;
    } else {
      ws.snapshotWord = wordInfo.typed;
      // Classify the current typed word against the target word.
      const fresh = classifyWordErrors(pw.word, wordInfo.typed, false, false);
      if (wordInfo.typed.length === pw.word.length) {
        // If the typed word is the same length as the target, replace the active
        // snapshot because the word has a complete current state.
        ws.errorEvents = fresh;
      } else {
        // If the word is still partial, merge so earlier mistakes are not lost as
        // the user continues typing.
        ws.errorEvents = dedupeMergeWordErrorEvents(ws.errorEvents, fresh);
      }
    }

    if (ws.isBackspacing && forwardCorrect) {
      // Backspace correction flow is complete once the word becomes clean again.
      ws.isBackspacing = false;
      ws.wasCorrect = true;
    } else if (ws.isBackspacing) {
      // Still in correction flow; keep existing correctness flag.
    } else if (forwardCorrect) {
      ws.wasCorrect = true;
    } else {
      ws.wasCorrect = false;
    }

    // Store latest typed length so future changes can be compared/debugged.
    ws.typedLength = wordInfo.typed.length;
  }, []);

  // Converts all per-word state into final WordMistake records after the game
  // ends. These objects are later saved to the database for stats and AI coach
  // feedback.
  const finalize = useCallback((
    displayText: string,
    rawInput: string,
    alignment: AlignmentResult,
    gameStartPerfTime: number,
    options?: ErrorCollectorFinalizeOptions
  ): WordMistake[] => {
    // Rebuild prompt word ranges at the end so final output is based on the
    // latest displayText.
    const promptWords = splitPromptWords(displayText);
    // Highest reached word is stored with every record so analysis can tell how
    // far through the prompt the user got.
    const maxWordTouched = maxWordIndexTouchedRef.current;
    // Final timestamp used for the active word if it did not already have an
    // end time.
    const endTime = gameStartPerfTime > 0 ? Math.round(performance.now() - gameStartPerfTime) : 0;
    // Final database-ready records are collected here.
    const results: WordMistake[] = [];

    // Walk through every prompt word and decide whether it should produce a
    // WordMistake analytics record.
    for (let i = 0; i < promptWords.length; i++) {
      const pw = promptWords[i];
      // Read the temporary WordState if this word was touched during typing.
      const ws = wordStatesRef.current.get(i);
      // Extract the final typed text for this word from the final alignment.
      const wordInfo = getWordInput(alignment, displayText, rawInput, pw.promptStart, pw.promptEnd);

      // Prefer the stored snapshot if one exists, otherwise use the final
      // alignment extraction.
      const previewTyped = ws?.snapshotWord ?? wordInfo.typed;
      if (
        options?.gameMode === "time" &&
        i === maxWordTouched &&
        ws?.endTimeMs == null &&
        (previewTyped !== pw.word || wordInfo.hasExtras)
      ) {
        // In time mode, ignore the unfinished active word if the timer ended
        // while the user was still in the middle of making an unresolved error.
        continue;
      }

      const finalWord = previewTyped;

      if (ws && ws.snapshotWord === null && wordInfo.typed.length > 0) {
        // If the user interacted with the word but no snapshot was stored yet,
        // create one during finalisation.
        ws.snapshotWord = wordInfo.typed;
        if (wordInfo.typed !== pw.word && !ws.suppressForwardErrorMerges) {
          // Classify unresolved final text if it differs from the target.
          ws.errorEvents = classifyWordErrors(pw.word, wordInfo.typed, false);
        }
      }

      // Decide the final word status saved to the database.
      let finalStatus: FinalStatus;
      if (finalWord === pw.word) {
        // A correct final word is stored as corrected because the analytics table
        // focuses on words that may have had mistakes/corrections.
        finalStatus = "corrected";
      } else if (finalWord.length === 0 && i <= maxWordTouched) {
        // The user reached this position but left the word empty.
        finalStatus = "skipped";
      } else if (finalWord.length === 0) {
        // Untouched future words are not saved.
        continue;
      } else if (wordInfo.hasExtras) {
        // Final text contains extra typed characters.
        finalStatus = "extra";
      } else {
        // Final text exists but does not equal the target.
        finalStatus = "incorrect";
      }

      // Skip words that never had state and do not have final typed content.
      const hadInteraction = ws != null || finalWord.length > 0;
      if (!hadInteraction) continue;

      // Start/end/duration are nullable because a word might have an error record
      // without a complete timing pair.
      const startMs = ws?.startTimeMs ?? null;
      let endMs = ws?.endTimeMs ?? null;

      if (endMs === null && finalWord.length > 0 && i === maxWordTouched) {
        // If the active final word was still being typed when the game ended, use
        // the game end time as the word end time.
        endMs = endTime;
      }

      const durationMs = startMs !== null && endMs !== null && endMs >= startMs
        ? endMs - startMs
        : null;

      // Combine corrected historical errors with current unresolved errors.
      const allEvents: WordErrorEvent[] = [];
      const pauses = ws?.pauseEvents ?? [];
      const combinedErrors = [...(ws?.archivedErrorEvents ?? []), ...(ws?.errorEvents ?? [])];
      const seenExactErrors = new Set<string>();
      const dedupedErrors: WordErrorEvent[] = [];
      for (const ev of combinedErrors) {
        // Exact dedupe prevents repeated identical snapshots being saved twice.
        const k = wordErrorEventExactKey(ev);
        if (!seenExactErrors.has(k)) {
          seenExactErrors.add(k);
          dedupedErrors.push(ev);
        }
      }
      // Remove overlapping unresolved substitutions when an omission better
      // describes the final unresolved error.
      const errors = normalizeFinalWordErrors(dedupedErrors);

      // Pauses are added first, then error events. Event order is rewritten below
      // so the database has a simple 0-based order for this word.
      for (const p of pauses) allEvents.push(p);
      for (const e of errors) allEvents.push(e);
      for (let ei = 0; ei < allEvents.length; ei++) {
        (allEvents[ei] as { event_order: number }).event_order = ei;
      }

      if (finalWord === pw.word) {
        // If the final word is correct, any non-pause mistakes that happened
        // during the word are considered corrected.
        for (const ev of allEvents) {
          if (ev.error_type !== "pause") {
            (ev as { corrected: boolean | null }).corrected = true;
          }
        }
      }

      // Build the final object that matches the WordMistake Zod schema and the
      // database table shape.
      const mistake: WordMistake = {
        // This final record stores both the final word result and all linked
        // error events for that word.
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

  // Clears all word analytics for a new test.
  const reset = useCallback(() => {
    wordStatesRef.current = new Map();
    lastKeystrokeTimeRef.current = 0;
    maxWordIndexTouchedRef.current = 0;
  }, []);

  // Memoise the returned API object so components/hooks using it do not receive
  // a new object reference on every render.
  return useMemo(
    () => ({ onInputChange, finalize, reset }),
    [onInputChange, finalize, reset]
  );
}
