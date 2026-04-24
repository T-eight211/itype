import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  type MutableRefObject,
  type RefObject,
} from "react";
import {
  computeAlignment,
  computeCheckpointInputIndex,
  countExtrasInActiveInputWord,
  isLastWordFullyCorrect as computeIsLastWordFullyCorrect,
} from "../lib/alignment";
import { getLastKeystrokeCorrectness, computeAccuracy } from "../lib/accuracy";
import {
  generateWords,
  generateWordsWithCoachPool,
  addNumbers,
  addPunctuation,
} from "../lib/prompt";
import { fetchQuote } from "../lib/quotes";
import { computeConsistency, formatWpm, roundTo2 } from "../utils/stats";
import { getCorrectCharsSoFar, charsToWpm, computeRawChars } from "../lib/wpm";
import { saveTypingResult } from "../server/save-typing-result";
import { scheduleMaybeFirstTypingCoachRun } from "@/features/typing-coach/server/schedule-maybe-first-coach";
import { useErrorCollector } from "./use-error-collector";
import { saveWordMistakes } from "../server/save-word-mistakes";
import type { WordMistake } from "../schemas/word-mistake";
import type { WordWrapGateFn } from "../components/word-wrap-gate";
import type { KeymapReactFlash } from "../lib/keymap-react-flash";
import {
  appendIncompleteRun,
  takeAllIncompleteRuns,
} from "@/features/xp/lib/incomplete-buffer";
import { INCOMPLETE_MIN_SECONDS } from "@/features/xp/lib/xp-constants";
import {
  awardXpForTypingResult,
  type AwardXpSuccess,
} from "@/features/xp/server/award-xp-for-typing-result";
import { emitXpAwarded } from "@/features/xp/lib/xp-events";
import { awardBadgesForTypingResult } from "@/features/badges/server/award-badges-for-typing-result";

export type GameMode = "time" | "words" | "quote";
export type QuoteLength = "all" | "short" | "medium" | "long" | "thicc";

const REACT_KEYMAP_FLASH_MS = 220;

function scheduleTextareaFocus(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  setFocused: (value: boolean) => void
): () => void {
  const id = requestAnimationFrame(() => {
    textareaRef.current?.focus();
    setFocused(true);
  });
  return () => cancelAnimationFrame(id);
}

export type UseTypingGameOptions = {
  wordWrapGateRef?: MutableRefObject<WordWrapGateFn | null>;
  coachMode?: boolean;
  coachPracticeWords?: string[];
  coachMixProbability?: number;
};

const DEFAULT_COACH_MIX = 0.9;

export function useTypingGame(
  urlMode: GameMode | null = null,
  options: UseTypingGameOptions = {}
) {
  const {
    wordWrapGateRef,
    coachMode = false,
    coachPracticeWords = [],
    coachMixProbability = DEFAULT_COACH_MIX,
  } = options;
  const [mode, setMode] = useState<GameMode>(() => urlMode ?? "time");
  const [wordCount, setWordCount] = useState("25");
  const [timerDuration, setTimerDuration] = useState("30");
  const [quoteLength, setQuoteLength] = useState<QuoteLength>("all");
  const [punctuation, setPunctuation] = useState(false);
  const [numbers, setNumbers] = useState(false);

  const [displayText, setDisplayText] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [wpm, setWpm] = useState(0);
  const [correctCharsSoFar, setCorrectCharsSoFar] = useState(0);
  const [correctKeystrokes, setCorrectKeystrokes] = useState(0);
  const [incorrectKeystrokes, setIncorrectKeystrokes] = useState(0);
  const [burstWpm, setBurstWpm] = useState<number[]>([]);
  const [wpmHistory, setWpmHistory] = useState<number[]>([]);
  const [rawWpmHistory, setRawWpmHistory] = useState<number[]>([]);
  const [incorrectHistory, setIncorrectHistory] = useState<number[]>([]);
  const [consistency, setConsistency] = useState<number | null>(null);
  const [wordMistakes, setWordMistakes] = useState<WordMistake[]>([]);
  const [xpAward, setXpAward] = useState<AwardXpSuccess | null>(null);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [keymapReactFlashes, setKeymapReactFlashes] = useState<KeymapReactFlash[]>([]);
  const keymapReactFlashIdRef = useRef(0);
  const keymapReactFlashTimeoutsRef = useRef<Map<number, number>>(new Map());

  const [regenKey, setRegenKey] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const displayTextRef = useRef<string>("");
  const rawInputRef = useRef<string>("");
  const lastBurstTickRef = useRef<number>(-1);
  const rawInputLengthAtLastTickRef = useRef<number>(0);
  const keysPressedThisSecondRef = useRef<number>(0);
  const incorrectAtLastTickRef = useRef<number>(0);
  const incorrectKeystrokesRef = useRef<number>(0);
  const correctKeystrokesRef = useRef<number>(0);
  const startPerformanceTimeRef = useRef<number>(0);
  const hasSavedResultRef = useRef(false);
  const endGameFinalizedRef = useRef(false);
  const burstWpmRef = useRef<number[]>([]);
  const wpmHistoryRef = useRef<number[]>([]);
  const rawWpmHistoryRef = useRef<number[]>([]);
  const incorrectHistoryRef = useRef<number[]>([]);


  const errorCollector = useErrorCollector();

  const captureAbandonedRunIfAny = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!startPerformanceTimeRef.current) return;
    if (hasSavedResultRef.current) return;
    const seconds = (performance.now() - startPerformanceTimeRef.current) / 1000;
    if (seconds < INCOMPLETE_MIN_SECONDS) return;
    const acc = computeAccuracy(
      correctKeystrokesRef.current,
      incorrectKeystrokesRef.current
    );
    appendIncompleteRun({ seconds, accuracy: acc });
  }, []);

  const clearAllKeymapReactFlashes = useCallback(() => {
    keymapReactFlashTimeoutsRef.current.forEach((tid) => window.clearTimeout(tid));
    keymapReactFlashTimeoutsRef.current.clear();
    setKeymapReactFlashes([]);
  }, []);

  useEffect(() => {
    return () => {
      keymapReactFlashTimeoutsRef.current.forEach((tid) => window.clearTimeout(tid));
      keymapReactFlashTimeoutsRef.current.clear();
    };
  }, []);

  const buildPromptWordBlock = useCallback(
    (count: number) => {
      if (
        coachMode &&
        coachPracticeWords.length > 0 &&
        (mode === "time" || mode === "words")
      ) {
        return generateWordsWithCoachPool(
          count,
          coachPracticeWords,
          coachMixProbability
        );
      }
      return generateWords(count);
    },
    [coachMode, coachPracticeWords, coachMixProbability, mode]
  );

  const alignment = useMemo(
    () => computeAlignment(displayText, rawInput),
    [displayText, rawInput]
  );

  const keymapNextExpectedChar = useMemo(() => {
    if (alignment.promptCursor >= displayText.length) return null;
    const ch = displayText[alignment.promptCursor];
    if (ch === "\n" || ch === "\r") return null;
    return ch ?? null;
  }, [displayText, alignment.promptCursor]);

  const checkpointInputIndex = useMemo(
    () => computeCheckpointInputIndex(alignment, displayText, rawInput),
    [alignment, displayText, rawInput]
  );

  const completedWordsCount = useMemo(() => {
    if (!displayText || !rawInput) return 0;
    const words = displayText.split(" ").filter(Boolean);
    if (words.length === 0) return 0;
    let pos = 0;
    let completed = 0;
    for (let i = 0; i < words.length; i++) {
      const wordLen = words[i]!.length;
      const charsToComplete = i < words.length - 1 ? wordLen + 1 : wordLen;
      if (alignment.promptCursor >= pos + charsToComplete) completed++;
      pos += charsToComplete;
    }
    return completed;
  }, [displayText, rawInput, alignment.promptCursor]);

  const totalWordsCount = useMemo(
    () => displayText.split(" ").filter(Boolean).length,
    [displayText]
  );

  const isLastWordCorrect = useMemo(
    () => computeIsLastWordFullyCorrect(alignment, displayText),
    [alignment, displayText]
  );

  const isGameEnded = useMemo(() => {
    const promptFinished =
      displayText.length > 0 &&
      rawInput.length > 0 &&
      alignment.promptCursor >= displayText.length &&
      (rawInput.endsWith(" ") || isLastWordCorrect);

    let timeExpired = false;
    if (mode === "time" && startTime) {
      const limit = parseInt(timerDuration, 10);
      if (!Number.isNaN(limit)) {
        const currentSeconds = (Date.now() - startTime) / 1000;
        timeExpired = currentSeconds >= limit;
      }
    }

    if (mode === "time") return timeExpired;
    return promptFinished || timeExpired;
  }, [
    displayText.length,
    rawInput.length,
    alignment.promptCursor,
    rawInput,
    isLastWordCorrect,
    mode,
    startTime,
    elapsedSeconds,
    timerDuration,
  ]);

  const timeDisplaySeconds = useMemo(() => {
    if (!startTime) return 0;
    const currentSeconds = (Date.now() - startTime) / 1000;
    if (mode === "time") {
      const limit = parseInt(timerDuration, 10);
      if (Number.isNaN(limit)) return 0;
      return Math.max(0, limit - currentSeconds);
    }
    return currentSeconds;
  }, [mode, timerDuration, startTime, elapsedSeconds]);

  const rawWpm = useMemo(() => {
    const rawChars = computeRawChars(displayText, rawInput);
    return roundTo2(charsToWpm(rawChars, elapsedSeconds));
  }, [displayText, rawInput, elapsedSeconds]);

  const wpmDisplay = useMemo(() => formatWpm(wpm), [wpm]);
  const rawWpmDisplay = useMemo(() => formatWpm(rawWpm), [rawWpm]);

  const accuracy = useMemo(
    () => roundTo2(computeAccuracy(correctKeystrokes, incorrectKeystrokes)),
    [correctKeystrokes, incorrectKeystrokes]
  );
  const accuracyDisplay = useMemo(() => formatWpm(accuracy), [accuracy]);

  const measureStr = useMemo(
    () =>
      alignment.cells
        .map((cell) =>
          cell.type === "prompt" ? displayText[cell.index] : cell.char
        )
        .join(""),
    [alignment, displayText]
  );

  const coachWordsKey = coachPracticeWords.join("\0");
  const settingsKey = `${mode}-${wordCount}-${timerDuration}-${quoteLength}-${punctuation}-${numbers}-${coachMode}-${coachWordsKey}`;


  useEffect(() => {
    if (urlMode != null) setMode(urlMode);
  }, [urlMode]);

  useEffect(() => { displayTextRef.current = displayText; }, [displayText]);
  useEffect(() => { rawInputRef.current = rawInput; }, [rawInput]);
  useEffect(() => { incorrectKeystrokesRef.current = incorrectKeystrokes; }, [incorrectKeystrokes]);
  useEffect(() => { correctKeystrokesRef.current = correctKeystrokes; }, [correctKeystrokes]);
  useEffect(() => { burstWpmRef.current = burstWpm; }, [burstWpm]);
  useEffect(() => { wpmHistoryRef.current = wpmHistory; }, [wpmHistory]);
  useEffect(() => { rawWpmHistoryRef.current = rawWpmHistory; }, [rawWpmHistory]);
  useEffect(() => { incorrectHistoryRef.current = incorrectHistory; }, [incorrectHistory]);

  useEffect(() => {
    const syncModifierKeyboardState = (event: KeyboardEvent) => {
      setIsCapsLockOn(event.getModifierState("CapsLock"));
      setIsShiftPressed(event.getModifierState("Shift"));
    };
    window.addEventListener("keydown", syncModifierKeyboardState);
    window.addEventListener("keyup", syncModifierKeyboardState);
    return () => {
      window.removeEventListener("keydown", syncModifierKeyboardState);
      window.removeEventListener("keyup", syncModifierKeyboardState);
    };
  }, []);


  const focusTypingInput = useCallback(() => {
    scheduleTextareaFocus(textareaRef, setIsInputFocused);
  }, []);

  useEffect(() => {
    return scheduleTextareaFocus(textareaRef, setIsInputFocused);
  }, [settingsKey, regenKey]);

  useEffect(() => {
    return () => {
      captureAbandonedRunIfAny();
    };
  }, [settingsKey, regenKey, captureAbandonedRunIfAny]);

  useEffect(() => {
    const handler = () => captureAbandonedRunIfAny();
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      captureAbandonedRunIfAny();
    };
  }, [captureAbandonedRunIfAny]);


  useEffect(() => {
    if (!startTime && rawInput.length > 0) {
      const now = Date.now();
      setStartTime(now);
      startPerformanceTimeRef.current = performance.now();
      lastBurstTickRef.current = -1;
      rawInputLengthAtLastTickRef.current = 0;
      incorrectAtLastTickRef.current = 0;
    }
  }, [rawInput, startTime]);


  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [rawInput]);


  const resetState = useCallback((text: string) => {
    setDisplayText(text);
    setRawInput("");
    setStartTime(null);
    setElapsedSeconds(0);
    setWpm(0);
    setCorrectCharsSoFar(0);
    setCorrectKeystrokes(0);
    setIncorrectKeystrokes(0);
    setBurstWpm([]);
    setWpmHistory([]);
    setRawWpmHistory([]);
    setIncorrectHistory([]);
    setConsistency(null);
    setWordMistakes([]);
    setXpAward(null);
    clearAllKeymapReactFlashes();
    hasSavedResultRef.current = false;
    endGameFinalizedRef.current = false;
    lastBurstTickRef.current = -1;
    rawInputLengthAtLastTickRef.current = 0;
    incorrectAtLastTickRef.current = 0;
    keysPressedThisSecondRef.current = 0;
    startPerformanceTimeRef.current = 0;
    errorCollector.reset();
  }, [errorCollector, clearAllKeymapReactFlashes]);


  useEffect(() => {
    if (!startTime || isGameEnded) return;

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const seconds = (now - startTime) / 1000;
      const currentTick = Math.floor(seconds);
      const rawLen = rawInputRef.current.length;

      const correct = getCorrectCharsSoFar(displayTextRef.current, rawInputRef.current);
      const rawChars = computeRawChars(displayTextRef.current, rawInputRef.current);
      const wpmVal = charsToWpm(correct, seconds);
      const rawWpmVal = charsToWpm(rawChars, seconds);

      if (currentTick > lastBurstTickRef.current) {
        const keysPressed = keysPressedThisSecondRef.current;
        const burst = Math.round((keysPressed / 5) * 60);
        const incorrectThisSecond =
          incorrectKeystrokesRef.current - incorrectAtLastTickRef.current;
        setBurstWpm((prev) => [...prev, burst]);
        setWpmHistory((prev) => [...prev, Math.round(wpmVal)]);
        setRawWpmHistory((prev) => [...prev, Math.round(rawWpmVal)]);
        setIncorrectHistory((prev) => [...prev, incorrectThisSecond]);
        keysPressedThisSecondRef.current = 0;
        rawInputLengthAtLastTickRef.current = rawLen;
        incorrectAtLastTickRef.current = incorrectKeystrokesRef.current;
        lastBurstTickRef.current = currentTick;
      }

      if (mode === "time") {
        const limit = parseInt(timerDuration, 10);
        if (!Number.isNaN(limit) && seconds >= limit) {
          setElapsedSeconds(seconds);
          setCorrectCharsSoFar(correct);
          setWpm(roundTo2(wpmVal));
          window.clearInterval(intervalId);
          return;
        }
      }

      setElapsedSeconds(seconds);
      setCorrectCharsSoFar(correct);
      setWpm(roundTo2(wpmVal));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [startTime, isGameEnded, mode, timerDuration]);


  useEffect(() => {
    if (!isGameEnded || !startTime) return;
    if (endGameFinalizedRef.current) return;
    endGameFinalizedRef.current = true;

    const finalSeconds = (Date.now() - startTime) / 1000;
    setElapsedSeconds(finalSeconds);
    const correct = getCorrectCharsSoFar(displayText, rawInput);
    setCorrectCharsSoFar(correct);
    const finalWpmVal = finalSeconds > 0 ? charsToWpm(correct, finalSeconds) : 0;
    if (finalSeconds > 0) {
      setWpm(roundTo2(finalWpmVal));
    }

    const rawChars = computeRawChars(displayText, rawInput);
    const finalWpm = Math.round(charsToWpm(correct, finalSeconds));
    const finalRaw = Math.round(charsToWpm(rawChars, finalSeconds));
    const finalIncorrect = incorrectKeystrokesRef.current - incorrectAtLastTickRef.current;
    const accuracyVal = computeAccuracy(correctKeystrokes, incorrectKeystrokes);

    let wpmHistoryFinal: number[];
    let rawWpmHistoryFinal: number[];
    let burstWpmFinal: number[];
    let incorrectHistoryFinal: number[];
    let consistencyVal: number;

    if (mode === "time") {
      const limit = parseInt(timerDuration, 10);
      const expected = Number.isNaN(limit) ? 0 : limit;
      const keysPressed = keysPressedThisSecondRef.current;
      const finalBurst = Math.round((keysPressed / 5) * 60);
      const bw = burstWpmRef.current;
      const wh = wpmHistoryRef.current;
      const rwh = rawWpmHistoryRef.current;
      const ih = incorrectHistoryRef.current;
      burstWpmFinal = bw.length < expected ? [...bw, finalBurst] : bw;
      wpmHistoryFinal = wh.length < expected ? [...wh, finalWpm] : wh;
      rawWpmHistoryFinal = rwh.length < expected ? [...rwh, finalRaw] : rwh;
      incorrectHistoryFinal = ih.length < expected ? [...ih, finalIncorrect] : ih;
      setBurstWpm(burstWpmFinal);
      setConsistency((consistencyVal = computeConsistency(burstWpmFinal)));
      setWpmHistory(wpmHistoryFinal);
      setRawWpmHistory(rawWpmHistoryFinal);
      setIncorrectHistory(incorrectHistoryFinal);
    } else {
      const elapsedMs = performance.now() - startPerformanceTimeRef.current;
      const totalSeconds = elapsedMs / 1000;
      const partialSeconds = totalSeconds % 1;
      const keysPressed = keysPressedThisSecondRef.current;
      const finalBurst =
        partialSeconds < 0.5
          ? Math.round((keysPressed / 5) * 60)
          : Math.round((keysPressed / 5) * (60 / partialSeconds));
      const bw = burstWpmRef.current;
      const wh = wpmHistoryRef.current;
      const rwh = rawWpmHistoryRef.current;
      const ih = incorrectHistoryRef.current;
      burstWpmFinal = [...bw, finalBurst];
      wpmHistoryFinal = [...wh, finalWpm];
      rawWpmHistoryFinal = [...rwh, finalRaw];
      incorrectHistoryFinal = [...ih, finalIncorrect];
      consistencyVal = computeConsistency(burstWpmFinal);
      setBurstWpm(burstWpmFinal);
      setConsistency(consistencyVal);
      setWpmHistory(wpmHistoryFinal);
      setRawWpmHistory(rawWpmHistoryFinal);
      setIncorrectHistory(incorrectHistoryFinal);
    }

    if (!hasSavedResultRef.current) {
      hasSavedResultRef.current = true;

      const finalAlignment = computeAlignment(displayText, rawInput);
      const finalizedMistakes = errorCollector.finalize(
        displayText,
        rawInput,
        finalAlignment,
        startPerformanceTimeRef.current,
        { gameMode: mode }
      );
      setWordMistakes(finalizedMistakes);

      const mistakesToSave = finalizedMistakes.filter(
        (m) => m.word_error_events.length > 0
      );

      const hadMistakeDuringRun = incorrectKeystrokesRef.current > 0;
      const hasUnresolvedCellsAtEnd = finalAlignment.cells.some(
        (cell) =>
          (cell.type === "prompt" && cell.status === "wrong") ||
          cell.type === "extra"
      );
      const hasUnresolvedWordsAtEnd = finalizedMistakes.some(
        (m) =>
          m.final_status === "incorrect" ||
          m.final_status === "extra" ||
          m.final_status === "skipped"
      );
      const cleanRun =
        hadMistakeDuringRun &&
        !hasUnresolvedCellsAtEnd &&
        !hasUnresolvedWordsAtEnd;

      saveTypingResult({
        wpm: roundTo2(finalWpmVal),
        rawWpm: roundTo2(charsToWpm(rawChars, finalSeconds)),
        accuracy: roundTo2(accuracyVal),
        consistency: consistencyVal,
        elapsedSeconds: finalSeconds,
        mode,
        language: "english",
        punctuation,
        numbers,
        quoteLength: mode === "quote" ? quoteLength : null,
        targetTimeSeconds: mode === "time" ? parseInt(timerDuration, 10) : null,
        targetWordCount: mode === "words" ? parseInt(wordCount, 10) : null,
        wpmHistory: wpmHistoryFinal,
        rawWpmHistory: rawWpmHistoryFinal,
        burstWpm: burstWpmFinal,
        incorrectHistory: incorrectHistoryFinal,
      })
        .then(async (res) => {
          if ("typingResultId" in res && res.typingResultId) {
            if (mistakesToSave.length > 0) {
              await saveWordMistakes({
                typing_result_id: res.typingResultId,
                word_mistakes: mistakesToSave,
              });
            }
            const incompleteRuns = takeAllIncompleteRuns();
            const xpResult = await awardXpForTypingResult({
              typingResultId: res.typingResultId,
              elapsedSeconds: finalSeconds,
              accuracy: roundTo2(accuracyVal),
              mode,
              punctuation,
              numbers,
              cleanRun,
              incompleteRuns,
            });
            if (xpResult.ok) {
              setXpAward(xpResult);
              emitXpAwarded(xpResult);
              await awardBadgesForTypingResult({
                typingResultId: res.typingResultId,
                wpm: roundTo2(finalWpmVal),
                accuracy: roundTo2(accuracyVal),
                currentStreakDays: xpResult.streakAfter,
                level: xpResult.levelAfter,
              });
            }
          }
          await scheduleMaybeFirstTypingCoachRun();
        })
        .catch(console.error);
    }
  }, [
    isGameEnded,
    startTime,
    mode,
    timerDuration,
    wordCount,
    quoteLength,
    displayText,
    rawInput,
    punctuation,
    numbers,
    correctKeystrokes,
    incorrectKeystrokes,
  ]);


  useEffect(() => {
    if (mode === "time" || mode === "words") {
      const count = mode === "words" ? parseInt(wordCount) : 100;
      let text = buildPromptWordBlock(count);
      if (numbers) text = addNumbers(text);
      if (punctuation) text = addPunctuation(text);
      resetState(text);
    } else if (mode === "quote") {
      let isCancelled = false;
      const loadQuote = async () => {
        try {
          const data = await fetchQuote(quoteLength);
          if (!isCancelled) resetState(data.content || "Failed to load quote.");
        } catch {
          if (!isCancelled) resetState("Failed to load quote. Try again.");
        }
      };
      loadQuote();
      return () => { isCancelled = true; };
    }
  }, [
    mode,
    wordCount,
    timerDuration,
    punctuation,
    numbers,
    quoteLength,
    regenKey,
    resetState,
    buildPromptWordBlock,
  ]);


  useEffect(() => {
    if (mode !== "time" || !startTime || isGameEnded || displayText.length === 0) return;
    const remainingChars = displayText.length - alignment.promptCursor;
    if (remainingChars < 150) {
      let batch = buildPromptWordBlock(100);
      if (numbers) batch = addNumbers(batch);
      if (punctuation) batch = addPunctuation(batch);
      setDisplayText((prev) => prev + (prev.endsWith(" ") ? "" : " ") + batch);
    }
  }, [
    mode,
    startTime,
    isGameEnded,
    displayText.length,
    alignment.promptCursor,
    numbers,
    punctuation,
    buildPromptWordBlock,
  ]);


  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (isGameEnded) {
        e.preventDefault();
        if (textareaRef.current) textareaRef.current.value = rawInput;
        return;
      }

      let next = e.target.value;
      next = next.replace(/\n/g, "");

      if (next === " " && rawInput === "") {
        e.preventDefault();
        if (textareaRef.current) textareaRef.current.value = rawInput;
        return;
      }

      if (next.length > rawInput.length && rawInput.endsWith(" ") && next.endsWith(" ")) {
        e.preventDefault();
        if (textareaRef.current) textareaRef.current.value = rawInput;
        return;
      }

      if (next.length < rawInput.length && next.length < checkpointInputIndex) {
        e.preventDefault();
        if (textareaRef.current) textareaRef.current.value = rawInput;
        return;
      }

      if (
        wordWrapGateRef?.current &&
        next.length > rawInput.length &&
        !next.endsWith(" ") &&
        wordWrapGateRef.current(next)
      ) {
        e.preventDefault();
        if (textareaRef.current) textareaRef.current.value = rawInput;
        return;
      }

      if (next.length > rawInput.length && !next.endsWith(" ")) {
        const prevExtraCount = countExtrasInActiveInputWord(alignment, rawInput);
        if (prevExtraCount >= 20) {
          e.preventDefault();
          if (textareaRef.current) textareaRef.current.value = rawInput;
          return;
        }
      }

      if (rawInput.length === 0 && next.length > 0 && startPerformanceTimeRef.current === 0) {
        startPerformanceTimeRef.current = performance.now();
      }

      if (next.length > rawInput.length) {
        keysPressedThisSecondRef.current += next.length - rawInput.length;
        for (let i = rawInput.length; i < next.length; i++) {
          const partial = next.slice(0, i + 1);
          const correctness = getLastKeystrokeCorrectness(displayText, partial);
          if (correctness === "correct") {
            setCorrectKeystrokes((c) => c + 1);
          } else if (correctness === "incorrect") {
            setIncorrectKeystrokes((c) => c + 1);
          }
        }
      }

      const currentAlignment = computeAlignment(displayText, next);
      errorCollector.onInputChange(rawInput, next, displayText, currentAlignment, startPerformanceTimeRef.current);

      setRawInput(next);
    },
    [
      isGameEnded,
      rawInput,
      checkpointInputIndex,
      displayText,
      alignment,
      errorCollector,
      wordWrapGateRef,
    ]
  );

  useEffect(() => {
    if (isGameEnded) clearAllKeymapReactFlashes();
  }, [isGameEnded, clearAllKeymapReactFlashes]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!isGameEnded && e.key.length === 1) {
        const expectedChar =
          alignment.promptCursor < displayText.length
            ? displayText[alignment.promptCursor]
            : undefined;
        const kind: "correct" | "incorrect" =
          expectedChar != null && e.key === expectedChar ? "correct" : "incorrect";
        const id = ++keymapReactFlashIdRef.current;
        setKeymapReactFlashes((prev) => [...prev, { id, ch: e.key, kind }]);
        const tid = window.setTimeout(() => {
          setKeymapReactFlashes((prev) => prev.filter((f) => f.id !== id));
          keymapReactFlashTimeoutsRef.current.delete(id);
        }, REACT_KEYMAP_FLASH_MS);
        keymapReactFlashTimeoutsRef.current.set(id, tid);
      }

      if (e.key === "CapsLock") {
        setIsCapsLockOn((prev) => !prev);
      } else {
        setIsCapsLockOn(e.getModifierState("CapsLock"));
      }
      setIsShiftPressed(e.getModifierState("Shift"));
      if (e.key === "Enter") {
        e.preventDefault();
        if (!isGameEnded && displayText.length > 0 && rawInput.length > 0 && !isLastWordCorrect) {
          const lastWordStart = displayText.lastIndexOf(" ") + 1;
          const inLastWord = alignment.promptCursor >= lastWordStart;
          if (inLastWord) {
            setIncorrectKeystrokes((c) => c + 1);
          }
        }
      }
    },
    [isGameEnded, displayText, rawInput, isLastWordCorrect, alignment.promptCursor]
  );

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "CapsLock") {
      setIsCapsLockOn(e.getModifierState("CapsLock"));
    }
    setIsShiftPressed(e.getModifierState("Shift"));
  }, []);


  const restartTest = useCallback(() => {
    setRegenKey((k) => k + 1);
  }, []);

  const retakeTest = useCallback(() => {
    const currentText = displayTextRef.current || displayText;
    if (!currentText) return;
    resetState(currentText);
    focusTypingInput();
  }, [displayText, resetState, focusTypingInput]);

  const nextTest = useCallback(() => {
    setRegenKey((k) => k + 1);
  }, []);

  return {
    mode, setMode,
    wordCount, setWordCount,
    timerDuration, setTimerDuration,
    quoteLength, setQuoteLength,
    punctuation, setPunctuation,
    numbers, setNumbers,

    displayText,
    rawInput,
    isInputFocused, setIsInputFocused,
    isCapsLockOn, setIsCapsLockOn,
    isShiftPressed,
    isGameEnded,

    keymapReactFlashes,
    keymapNextExpectedChar,

    wpm, rawWpm, wpmDisplay, rawWpmDisplay, accuracy, accuracyDisplay,
    timeDisplaySeconds,
    elapsedSeconds,
    correctCharsSoFar,
    correctKeystrokes, incorrectKeystrokes,
    burstWpm,
    wpmHistory, rawWpmHistory,
    incorrectHistory,
    consistency,
    completedWordsCount, totalWordsCount,
    wordMistakes,
    xpAward,

    alignment,
    measureStr,
    settingsKey,

    textareaRef,
    focusTypingInput,
    handleInputChange,
    handleKeyDown,
    handleKeyUp,

    restartTest,
    retakeTest,
    nextTest,
  };
}
