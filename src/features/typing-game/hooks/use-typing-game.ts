import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  computeAlignment,
  computeCheckpointInputIndex,
  isLastWordFullyCorrect as computeIsLastWordFullyCorrect,
} from "../lib/alignment";
import { getLastKeystrokeCorrectness, computeAccuracy } from "../lib/accuracy";
import { generateWords, addNumbers, addPunctuation } from "../lib/prompt";
import { fetchQuote } from "../lib/quotes";
import { computeConsistency } from "../utils/stats";
import { getCorrectCharsSoFar, charsToWpm, computeRawChars } from "../lib/wpm";

export type GameMode = "time" | "words" | "quote";
export type QuoteLength = "all" | "short" | "medium" | "long" | "thicc";

export function useTypingGame() {
  const [mode, setMode] = useState<GameMode>("time");
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const displayTextRef = useRef<string>("");
  const rawInputRef = useRef<string>("");
  const lastBurstTickRef = useRef<number>(-1);
  const rawInputLengthAtLastTickRef = useRef<number>(0);
  const keysPressedThisSecondRef = useRef<number>(0);
  const incorrectAtLastTickRef = useRef<number>(0);
  const incorrectKeystrokesRef = useRef<number>(0);
  const startPerformanceTimeRef = useRef<number>(0);

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
    return charsToWpm(rawChars, elapsedSeconds);
  }, [displayText, rawInput, elapsedSeconds]);

  const accuracy = useMemo(
    () => computeAccuracy(correctKeystrokes, incorrectKeystrokes),
    [correctKeystrokes, incorrectKeystrokes]
  );

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

  useEffect(() => { displayTextRef.current = displayText; }, [displayText]);
  useEffect(() => { rawInputRef.current = rawInput; }, [rawInput]);
  useEffect(() => { incorrectKeystrokesRef.current = incorrectKeystrokes; }, [incorrectKeystrokes]);

  // --- Focus management ---

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      setIsInputFocused(true);
    }
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      textareaRef.current?.focus();
      setIsInputFocused(true);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey]);

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
    lastBurstTickRef.current = -1;
    rawInputLengthAtLastTickRef.current = 0;
    incorrectAtLastTickRef.current = 0;
    keysPressedThisSecondRef.current = 0;
  }, []);

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
          setWpm(wpmVal);
          window.clearInterval(intervalId);
          return;
        }
      }

      setElapsedSeconds(seconds);
      setCorrectCharsSoFar(correct);
      setWpm(wpmVal);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [startTime, isGameEnded, mode, timerDuration]);

  // --- Game end ---

  useEffect(() => {
    if (!isGameEnded || !startTime) return;

    const finalSeconds = (Date.now() - startTime) / 1000;
    setElapsedSeconds(finalSeconds);
    const correct = getCorrectCharsSoFar(displayText, rawInput);
    setCorrectCharsSoFar(correct);
    if (finalSeconds > 0) {
      setWpm(charsToWpm(correct, finalSeconds));
    }

    if (mode === "time") {
      const limit = parseInt(timerDuration, 10);
      const expectedBursts = Number.isNaN(limit) ? 0 : limit;
      const keysPressed = keysPressedThisSecondRef.current;
      const finalBurst = Math.round((keysPressed / 5) * 60);
      setBurstWpm((prev) => {
        const withFinal =
          prev.length < expectedBursts ? [...prev, finalBurst] : prev;
        setConsistency(computeConsistency(withFinal));
        return withFinal;
      });
    } else {
      const elapsedMs = performance.now() - startPerformanceTimeRef.current;
      const totalSeconds = elapsedMs / 1000;
      const partialSeconds = totalSeconds % 1;
      const keysPressed = keysPressedThisSecondRef.current;
      let finalBurst: number;
      if (partialSeconds < 0.5) {
        finalBurst = Math.round((keysPressed / 5) * 60);
      } else {
        finalBurst = Math.round((keysPressed / 5) * (60 / partialSeconds));
      }
      setBurstWpm((prev) => {
        const withFinal = [...prev, finalBurst];
        setConsistency(computeConsistency(withFinal));
        return withFinal;
      });
    }
  }, [isGameEnded, startTime, mode, timerDuration, displayText, rawInput]);

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
  }, [mode, wordCount, timerDuration, punctuation, numbers, quoteLength, resetState]);

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

      setRawInput(next);
    },
    [isGameEnded, rawInput, checkpointInputIndex, displayText]
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

    wpm, rawWpm, accuracy,
    timeDisplaySeconds,
    elapsedSeconds,
    correctCharsSoFar,
    correctKeystrokes, incorrectKeystrokes,
    burstWpm,
    wpmHistory, rawWpmHistory,
    incorrectHistory,
    consistency,
    completedWordsCount, totalWordsCount,

    alignment,
    measureStr,
    settingsKey,

    textareaRef,
    handleInputChange,
    handleKeyDown,
  };
}
