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
import { generateWords, addNumbers, addPunctuation } from "../lib/prompt";
import { fetchQuote } from "../lib/quotes";
import { computeConsistency, formatWpm, roundTo2 } from "../utils/stats";
import { getCorrectCharsSoFar, charsToWpm, computeRawChars } from "../lib/wpm";
import { saveTypingResult } from "../server/save-typing-result";
import { useErrorCollector } from "./use-error-collector";
import { saveWordMistakes } from "../server/save-word-mistakes";
import type { WordMistake } from "../schemas/word-mistake";
import type { WordWrapGateFn } from "../components/word-wrap-gate";

export type GameMode = "time" | "words" | "quote";
export type QuoteLength = "all" | "short" | "medium" | "long" | "thicc";

/** Single place for “move focus to the hidden typing textarea” (rAF so it wins over toolbar buttons). */
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
  /** When set, returning true blocks a keystroke that would push the active nowrap word to the next line. */
  wordWrapGateRef?: MutableRefObject<WordWrapGateFn | null>;
};

export function useTypingGame(
  urlMode: GameMode | null = null,
  options: UseTypingGameOptions = {}
) {
  const { wordWrapGateRef } = options;
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

  // Used to explicitly regenerate a new prompt with the same settings.
  const [regenKey, setRegenKey] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const displayTextRef = useRef<string>("");
  const rawInputRef = useRef<string>("");
  const lastBurstTickRef = useRef<number>(-1);
  const rawInputLengthAtLastTickRef = useRef<number>(0);
  const keysPressedThisSecondRef = useRef<number>(0);
  const incorrectAtLastTickRef = useRef<number>(0);
  const incorrectKeystrokesRef = useRef<number>(0);
  const startPerformanceTimeRef = useRef<number>(0);
  const hasSavedResultRef = useRef(false);
  /** Prevents game-end effect from re-running after it mutates history state (avoids max update depth). */
  const endGameFinalizedRef = useRef(false);
  const burstWpmRef = useRef<number[]>([]);
  const wpmHistoryRef = useRef<number[]>([]);
  const rawWpmHistoryRef = useRef<number[]>([]);
  const incorrectHistoryRef = useRef<number[]>([]);

  // --- Error collector ---

  const errorCollector = useErrorCollector();

  // --- Derived values ---

  const alignment = useMemo(
    () => computeAlignment(displayText, rawInput),
    [displayText, rawInput]
  );

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

  const settingsKey = `${mode}-${wordCount}-${timerDuration}-${quoteLength}-${punctuation}-${numbers}`;

  // --- Ref sync ---

  useEffect(() => {
    if (urlMode != null) setMode(urlMode);
  }, [urlMode]);

  useEffect(() => { displayTextRef.current = displayText; }, [displayText]);
  useEffect(() => { rawInputRef.current = rawInput; }, [rawInput]);
  useEffect(() => { incorrectKeystrokesRef.current = incorrectKeystrokes; }, [incorrectKeystrokes]);
  useEffect(() => { burstWpmRef.current = burstWpm; }, [burstWpm]);
  useEffect(() => { wpmHistoryRef.current = wpmHistory; }, [wpmHistory]);
  useEffect(() => { rawWpmHistoryRef.current = rawWpmHistory; }, [rawWpmHistory]);
  useEffect(() => { incorrectHistoryRef.current = incorrectHistory; }, [incorrectHistory]);

  // --- Focus management (settings change, new prompt via regenKey, initial mount) ---

  const focusTypingInput = useCallback(() => {
    scheduleTextareaFocus(textareaRef, setIsInputFocused);
  }, []);

  useEffect(() => {
    return scheduleTextareaFocus(textareaRef, setIsInputFocused);
  }, [settingsKey, regenKey]);

  // --- Start time detection ---

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

  // --- Cursor position enforcement ---

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [rawInput]);

  // --- Reset helper ---

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
    hasSavedResultRef.current = false;
    endGameFinalizedRef.current = false;
    lastBurstTickRef.current = -1;
    rawInputLengthAtLastTickRef.current = 0;
    incorrectAtLastTickRef.current = 0;
    keysPressedThisSecondRef.current = 0;
    startPerformanceTimeRef.current = 0;
    errorCollector.reset();
  }, [errorCollector]);

  // --- Timer interval ---

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

  // --- Game end ---

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
        .then((res) => {
          if ("typingResultId" in res && res.typingResultId && finalizedMistakes.length > 0) {
            return saveWordMistakes({
              typing_result_id: res.typingResultId,
              word_mistakes: finalizedMistakes,
            });
          }
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

  // --- Prompt generation / loading ---

  useEffect(() => {
    if (mode === "time" || mode === "words") {
      const count = mode === "words" ? parseInt(wordCount) : 100;
      let text = generateWords(count);
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
  }, [mode, wordCount, timerDuration, punctuation, numbers, quoteLength, regenKey, resetState]);

  // --- Time mode: append text when running low ---

  useEffect(() => {
    if (mode !== "time" || !startTime || isGameEnded || displayText.length === 0) return;
    const remainingChars = displayText.length - alignment.promptCursor;
    if (remainingChars < 150) {
      let batch = generateWords(100);
      if (numbers) batch = addNumbers(batch);
      if (punctuation) batch = addPunctuation(batch);
      setDisplayText((prev) => prev + (prev.endsWith(" ") ? "" : " ") + batch);
    }
  }, [mode, startTime, isGameEnded, displayText.length, alignment.promptCursor, numbers, punctuation]);

  // --- Input handlers ---

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

      // Block extra characters beyond 20 for the current word.
      // Extras only exist in the active word (checkpoint prevents them in committed words).
      if (next.length > rawInput.length && !next.endsWith(" ")) {
        const prevExtraCount = countExtrasInActiveInputWord(alignment, rawInput);
        if (prevExtraCount >= 20) {
          e.preventDefault();
          if (textareaRef.current) textareaRef.current.value = rawInput;
          return;
        }
      }

      // Set performance start time synchronously on the very first keystroke
      // so the error collector has the correct reference before the useEffect fires.
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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

  // --- Public actions ---

  const restartTest = useCallback(() => {
    // Restart always means: new prompt with current settings.
    setRegenKey((k) => k + 1);
  }, []);

  const retakeTest = useCallback(() => {
    // Retake uses the same prompt text again.
    const currentText = displayTextRef.current || displayText;
    if (!currentText) return;
    resetState(currentText);
    focusTypingInput();
  }, [displayText, resetState, focusTypingInput]);

  const nextTest = useCallback(() => {
    // Next test is effectively the same as restart: new prompt.
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
    isGameEnded,

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

    alignment,
    measureStr,
    settingsKey,

    textareaRef,
    focusTypingInput,
    handleInputChange,
    handleKeyDown,

    restartTest,
    retakeTest,
    nextTest,
  };
}
