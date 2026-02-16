"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { Separator } from "@/components/ui/separator";
import { Clock, Type, Quote, Hash, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  computeAlignment,
  type AlignmentCell,
  type AlignmentResult,
  computeCheckpointInputIndex,
  isLastWordFullyCorrect as computeIsLastWordFullyCorrect,
} from "../lib/alignment";
import {
  getLastKeystrokeCorrectness,
  computeAccuracy,
} from "../lib/accuracy";
import { generateWords, addNumbers, addPunctuation } from "../lib/prompt";
import { fetchQuote } from "../lib/quotes";

export function TypingGame() {
  const [mode, setMode] = useState<"time" | "words" | "quote">("time");
  const [wordCount, setWordCount] = useState("25");
  const [timerDuration, setTimerDuration] = useState("30");
  const [quoteLength, setQuoteLength] = useState<"all" | "short" | "medium" | "long" | "thicc">("all");
  const [punctuation, setPunctuation] = useState(false);
  const [numbers, setNumbers] = useState(false);
  const [displayText, setDisplayText] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [lineBreakIndices, setLineBreakIndices] = useState<Set<number>>(new Set());
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [wpm, setWpm] = useState(0);
  const [correctCharsSoFar, setCorrectCharsSoFar] = useState(0);
  const [correctKeystrokes, setCorrectKeystrokes] = useState(0);
  const [incorrectKeystrokes, setIncorrectKeystrokes] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const wrapContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollAnchorRef = useRef<number | null>(null);
  const displayTextRef = useRef<string>("");
  const rawInputRef = useRef<string>("");

  const alignment = React.useMemo(
    () => computeAlignment(displayText, rawInput),
    [displayText, rawInput]
  );

  const checkpointInputIndex = React.useMemo(() => {
    return computeCheckpointInputIndex(alignment, displayText, rawInput);
  }, [alignment, displayText, rawInput]);

  const isLastWordCorrect = React.useMemo(
    () => computeIsLastWordFullyCorrect(alignment, displayText),
    [alignment, displayText]
  );

  const isGameEnded = React.useMemo(() => {
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

 
  const getCorrectCharsSoFar = React.useCallback(
    (prompt: string, input: string): number => {
      if (!prompt || !input) return 0;

      const targetWords = prompt.split(" ");
      const typedWords = input.split(" ");
      const wordCount = Math.max(targetWords.length, typedWords.length);

      let total = 0;

      for (let i = 0; i < wordCount; i++) {
        const target = targetWords[i] ?? "";
        const typed = typedWords[i] ?? "";

        if (!typed) continue;


        if (typed.length > target.length || !target.startsWith(typed)) {
          continue;
        }

        const userTypedSpaceAfter = i < typedWords.length - 1;
        const targetHasSpaceAfter = i < targetWords.length - 1;

        if (userTypedSpaceAfter && typed.length < target.length) {
          continue;
        }


        total += typed.length;
        if (targetHasSpaceAfter && userTypedSpaceAfter && typed.length === target.length) {
          total += 1;
        }
      }

      return total;
    },
    []
  );

  const timeDisplaySeconds = React.useMemo(() => {
    if (!startTime) return 0;
    const currentSeconds = (Date.now() - startTime) / 1000;
    if (mode === "time") {
      const limit = parseInt(timerDuration, 10);
      if (Number.isNaN(limit)) return 0;
      return Math.max(0, limit - currentSeconds);
    }
    return currentSeconds;
  }, [mode, timerDuration, startTime, elapsedSeconds]);

  // Raw WPM: (typed chars - extra chars) / 5 / minutes. Includes correct + wrong, excludes skipped + extra.
  const rawWpm = React.useMemo(() => {
    const extraCount = alignment.cells.filter(
      (c) => c.type === "extra"
    ).length;
    const rawChars = Math.max(0, rawInput.length - extraCount);
    const minutes = elapsedSeconds / 60;
    return minutes > 0 ? (rawChars / 5) / minutes : 0;
  }, [alignment.cells, rawInput.length, elapsedSeconds]);

  const measureStr = React.useMemo(
    () =>
      alignment.cells
        .map((cell) =>
          cell.type === "prompt" ? displayText[cell.index] : cell.char
        )
        .join(""),
    [alignment, displayText]
  );

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      setIsInputFocused(true);
    }
  }, []);

  // Auto-focus textarea when settings change so blinker is active and ready to type
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      textareaRef.current?.focus();
      setIsInputFocused(true);
    });
    return () => cancelAnimationFrame(id);
  }, [mode, wordCount, timerDuration, quoteLength, punctuation, numbers]);

  useEffect(() => {
    if (!startTime && rawInput.length > 0) {
      setStartTime(Date.now());
    }
  }, [rawInput, startTime]);

  useEffect(() => {
    displayTextRef.current = displayText;
  }, [displayText]);

  useEffect(() => {
    rawInputRef.current = rawInput;
  }, [rawInput]);

  useEffect(() => {
    if (!startTime || isGameEnded) return;

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const seconds = (now - startTime) / 1000;
      
      if (mode === "time") {
        const limit = parseInt(timerDuration, 10);
        if (!Number.isNaN(limit) && seconds >= limit) {
          const finalSeconds = seconds;
          setElapsedSeconds(finalSeconds);
          const correct = getCorrectCharsSoFar(displayTextRef.current, rawInputRef.current);
          setCorrectCharsSoFar(correct);
          if (finalSeconds > 0) {
            const minutes = finalSeconds / 60;
            setWpm((correct / 5) / minutes);
          }
          window.clearInterval(intervalId);
          return;
        }
      }
      
      setElapsedSeconds(seconds);

      const correct = getCorrectCharsSoFar(displayTextRef.current, rawInputRef.current);
      setCorrectCharsSoFar(correct);

      if (seconds > 0) {
        const minutes = seconds / 60;
        setWpm((correct / 5) / minutes);
      } else {
        setWpm(0);
      }
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [startTime, isGameEnded, mode, timerDuration, getCorrectCharsSoFar]);

  useEffect(() => {
    if (isGameEnded && startTime) {
      const finalSeconds = (Date.now() - startTime) / 1000;
      setElapsedSeconds(finalSeconds);
      const correct = getCorrectCharsSoFar(displayText, rawInput);
      setCorrectCharsSoFar(correct);
      if (finalSeconds > 0) {
        const minutes = finalSeconds / 60;
        setWpm((correct / 5) / minutes);
      }
    }
  }, [isGameEnded, startTime, displayText, rawInput, getCorrectCharsSoFar]);

  useEffect(() => {
    if (mode === "time" || mode === "words") {
      const count = mode === "words" ? parseInt(wordCount) : 50;
      let text = generateWords(count);
      
      if (numbers) {
        text = addNumbers(text);
      }
      
      if (punctuation) {
        text = addPunctuation(text);
      }
      
      setDisplayText(text);
      setRawInput("");
      setStartTime(null);
      setElapsedSeconds(0);
      setWpm(0);
      setCorrectCharsSoFar(0);
      setCorrectKeystrokes(0);
      setIncorrectKeystrokes(0);
    } else if (mode === "quote") {
      let isCancelled = false;

      const loadQuote = async () => {
        try {
          const data = await fetchQuote(quoteLength);
          if (!isCancelled) {
            setDisplayText(data.content || "Failed to load quote.");
            setRawInput("");
            setStartTime(null);
            setElapsedSeconds(0);
            setWpm(0);
            setCorrectCharsSoFar(0);
            setCorrectKeystrokes(0);
            setIncorrectKeystrokes(0);
          }
        } catch {
          if (!isCancelled) {
            setDisplayText("Failed to load quote. Try again.");
            setRawInput("");
            setStartTime(null);
            setElapsedSeconds(0);
            setWpm(0);
            setCorrectCharsSoFar(0);
            setCorrectKeystrokes(0);
            setIncorrectKeystrokes(0);
          }
        }
      };

      loadQuote();

      return () => {
        isCancelled = true;
      };
    }
  }, [mode, wordCount, punctuation, numbers, quoteLength]);

  const runMeasure = useCallback(() => {
    const measureEl = measureRef.current;
    if (!measureEl || !measureStr) return null;
    const textNode = measureEl.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return null;
    const indices = new Set<number>();
    let lastTop = -1;
    for (let i = 0; i < measureStr.length; i++) {
      const range = document.createRange();
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (lastTop >= 0 && Math.round(rect.top) > Math.round(lastTop)) indices.add(i);
      lastTop = rect.top;
    }
    return indices;
  }, [measureStr]);

  useLayoutEffect(() => {
    const containerEl = wrapContainerRef.current;
    if (!containerEl || !measureStr) {
      setLineBreakIndices(new Set());
      return;
    }
    const indices = runMeasure();
    if (indices !== null) {
      setLineBreakIndices((prev) => {
        if (prev.size !== indices.size) return indices;
        for (const i of indices) if (!prev.has(i)) return indices;
        return prev;
      });
    }
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        const next = runMeasure();
        if (next !== null) setLineBreakIndices(next);
      });
    });
    ro.observe(containerEl);
    return () => ro.disconnect();
  }, [measureStr, runMeasure]);

  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = 0;
  }, [displayText]);

  const sortedLineBreaks = React.useMemo(
    () => Array.from(lineBreakIndices).sort((a, b) => a - b),
    [lineBreakIndices]
  );
  useLayoutEffect(() => {
    if (sortedLineBreaks.length < 2) return;
    const startOfLine3 = sortedLineBreaks[1];
    const cursorMeasureIndex =
      alignment.cursorCellIndex < 0 ? 0 : alignment.cursorCellIndex;
    const hasScrolledForThisRegion = lastScrollAnchorRef.current === startOfLine3;

    if (cursorMeasureIndex <= startOfLine3) {
      if (cursorMeasureIndex < startOfLine3) {
        lastScrollAnchorRef.current = null;
      }
      return;
    }

    if (hasScrolledForThisRegion) return;

    if (cursorMeasureIndex === startOfLine3 + 1 && measureStr.length > startOfLine3) {
      const charBeforeCursor = measureStr[startOfLine3];
      if (charBeforeCursor === " " && lineBreakIndices.has(startOfLine3)) {
        return;
      }
    }

    const measureEl = measureRef.current;
    const scrollEl = scrollContainerRef.current;
    if (!measureEl || !scrollEl) return;
    const textNode = measureEl.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;
    const startOfLine2 = sortedLineBreaks[0];
    if (startOfLine2 >= measureStr.length) return;
    const range = document.createRange();
    range.setStart(textNode, startOfLine2);
    range.setEnd(textNode, startOfLine2 + 1);
    const charRect = range.getBoundingClientRect();
    const scrollRect = scrollEl.getBoundingClientRect();
    const offset = charRect.top - scrollRect.top + scrollEl.scrollTop;
    scrollEl.scrollTop = Math.max(0, offset);
    lastScrollAnchorRef.current = startOfLine3;
  }, [alignment.cursorCellIndex, measureStr.length, sortedLineBreaks, measureStr, lineBreakIndices]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [rawInput]);

  return (
    <div className="container grid grid-rows-[auto_1fr_auto] gap-6 min-h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-center gap-3">
        <ToggleGroup type="single" value={mode} onValueChange={(value) => value && setMode(value as typeof mode)}>
          <ToggleGroupItem value="time" aria-label="Time mode">
            <Clock className="w-4 h-4 mr-2" />
            time
          </ToggleGroupItem>
          <ToggleGroupItem value="words" aria-label="Words mode">
            <Type className="w-4 h-4 mr-2" />
            words
          </ToggleGroupItem>
          <ToggleGroupItem value="quote" aria-label="Quote mode">
            <Quote className="w-4 h-4 mr-2" />
            quote
          </ToggleGroupItem>
        </ToggleGroup>
        
        <Separator orientation="vertical" className="h-6" />
        
        {mode === "words" && (
          <ToggleGroup type="single" value={wordCount} onValueChange={(value) => value && setWordCount(value)}>
            <ToggleGroupItem value="10">10</ToggleGroupItem>
            <ToggleGroupItem value="25">25</ToggleGroupItem>
            <ToggleGroupItem value="50">50</ToggleGroupItem>
            <ToggleGroupItem value="100">100</ToggleGroupItem>
          </ToggleGroup>
        )}
        
        {mode === "time" && (
          <ToggleGroup type="single" value={timerDuration} onValueChange={(value) => value && setTimerDuration(value)}>
            <ToggleGroupItem value="15">15</ToggleGroupItem>
            <ToggleGroupItem value="30">30</ToggleGroupItem>
            <ToggleGroupItem value="60">60</ToggleGroupItem>
            <ToggleGroupItem value="120">120</ToggleGroupItem>
          </ToggleGroup>
        )}
        
        {mode === "quote" && (
          <ToggleGroup type="single" value={quoteLength} onValueChange={(value) => value && setQuoteLength(value as typeof quoteLength)}>
            <ToggleGroupItem value="all">all</ToggleGroupItem>
            <ToggleGroupItem value="short">short</ToggleGroupItem>
            <ToggleGroupItem value="medium">medium</ToggleGroupItem>
            <ToggleGroupItem value="long">long</ToggleGroupItem>
            <ToggleGroupItem value="thicc">thicc</ToggleGroupItem>
          </ToggleGroup>
        )}
        
        {(mode === "words" || mode === "time") && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <ToggleGroup type="multiple" value={[punctuation ? "punctuation" : "", numbers ? "numbers" : ""].filter(Boolean)}>
              <ToggleGroupItem 
                value="punctuation" 
                aria-label="Toggle punctuation"
                onClick={() => setPunctuation(!punctuation)}
              >
                <AtSign className="w-4 h-4" />
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="numbers" 
                aria-label="Toggle numbers"
                onClick={() => setNumbers(!numbers)}
              >
                <Hash className="w-4 h-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </>
        )}
      </div>

      <div className="flex items-center justify-start w-full cursor-default" ref={wrapContainerRef}>
        <div
          className="relative w-full min-h-18 select-none cursor-default"
          dir="ltr"
          onMouseDown={(e) => {
            // Always focus the hidden textarea when clicking anywhere in the typing area
            e.preventDefault();
            textareaRef.current?.focus();
          }}
        >
          <div
            ref={measureRef}
            className={cn(
              "absolute top-0 left-0 text-xl md:text-2xl leading-relaxed font-mono text-left w-full",
              "whitespace-pre-wrap pointer-events-none invisible"
            )}
            style={{ wordBreak: "keep-all", overflowWrap: "break-word" }}
            aria-hidden
          >
            {measureStr}
          </div>
          <style>{`.typing-game-scroll-hide{scrollbar-width:none;-ms-overflow-style:none}.typing-game-scroll-hide::-webkit-scrollbar{display:none}`}</style>
          <div
            ref={scrollContainerRef}
            className={cn(
              "overflow-y-auto overflow-x-hidden select-none typing-game-scroll-hide cursor-default",
              "text-xl md:text-2xl leading-relaxed font-mono",
              "h-[calc(3*1.625*1em)]"
            )}
            aria-hidden
          >
          <div
            className={cn(
              "text-xl md:text-2xl leading-relaxed font-mono text-left w-full cursor-default",
              "whitespace-pre-wrap"
            )}
            style={{ wordBreak: "keep-all", overflowWrap: "break-word" }}
          >
            {(() => {
              const getClass = (cell: AlignmentCell) => {
                if (cell.type === "extra") return "text-red-800 dark:text-red-400";
                if (cell.type === "prompt") {
                  if (cell.status === "correct") return "text-foreground";
                  if (cell.status === "wrong") return "text-destructive";
                  return "text-muted-foreground/60";
                }
                return "text-foreground";
              };
              const getCh = (cell: AlignmentCell) =>
                cell.type === "prompt" ? displayText[cell.index] : cell.char;

              const segments: { word: boolean; start: number; end: number }[] = [];
              let i = 0;
              while (i < alignment.cells.length) {
                const cell = alignment.cells[i];
                const ch = getCh(cell);
                if (ch === " ") {
                  segments.push({ word: false, start: i, end: i + 1 });
                  i += 1;
                } else {
                  const start = i;
                  while (i < alignment.cells.length && getCh(alignment.cells[i]) !== " ") i++;
                  segments.push({ word: true, start, end: i });
                }
              }

              const cursorBlinker = (
                <span
                  className="absolute left-0 top-0 w-0.5 h-full bg-yellow-500"
                  style={{
                    animation:
                      !isGameEnded && isInputFocused
                        ? "cursor-blink 1s step-end infinite"
                        : "none",
                    opacity: !isGameEnded && isInputFocused ? 1 : 0,
                  }}
                  aria-hidden
                />
              );
              const out: React.ReactNode[] = [];
              if (alignment.cursorCellIndex === -1) {
                out.push(
                  <span key="cursor-start" className="inline-block w-0 h-[1em] align-middle relative shrink-0">
                    {cursorBlinker}
                  </span>
                );
              }

              segments.forEach((seg, segIdx) => {
                if (seg.word) {
                  const chars: React.ReactNode[] = [];
                  for (let j = seg.start; j < seg.end; j++) {
                    const cell = alignment.cells[j];
                    chars.push(<span key={j} className={getClass(cell)}>{getCh(cell)}</span>);
                    if (j === alignment.cursorCellIndex) {
                      chars.push(
                        <span key={`cur-${j}`} className="inline-block w-0 h-[1em] align-middle relative shrink-0">
                          {cursorBlinker}
                        </span>
                      );
                    }
                  }
                  out.push(
                    <span key={`w-${segIdx}`} className="whitespace-nowrap">
                      {chars}
                    </span>
                  );
                } else {
                  const j = seg.start;
                  const cell = alignment.cells[j];
                  out.push(<span key={`s-${segIdx}`} className={getClass(cell)}> </span>);
                  if (j === alignment.cursorCellIndex) {
                    out.push(
                      <span key={`cur-${j}`} className="inline-block w-0 h-[1em] align-middle relative shrink-0">
                        {cursorBlinker}
                      </span>
                    );
                  }
                }
              });

              return <>{out}</>;
            })()}
          </div>
          </div>
          <textarea
            ref={textareaRef}
            value={rawInput}
            readOnly={isGameEnded}
            onChange={(e) => {
              if (isGameEnded) {
                e.preventDefault();
                if (textareaRef.current) textareaRef.current.value = rawInput;
                return;
              }
              let next = e.target.value;
              next = next.replace(/\n/g, "");

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
                for (let i = rawInput.length; i < next.length; i++) {
                  const partial = next.slice(0, i + 1);
                  const correctness = getLastKeystrokeCorrectness(
                    displayText,
                    partial
                  );
                  if (correctness === "correct") {
                    setCorrectKeystrokes((c) => c + 1);
                  } else if (correctness === "incorrect") {
                    setIncorrectKeystrokes((c) => c + 1);
                  }
                }
              }
              setRawInput(next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                // Enter on partial last word = skip chars, count as incorrect
                if (
                  !isGameEnded &&
                  displayText.length > 0 &&
                  rawInput.length > 0 &&
                  !isLastWordCorrect
                ) {
                  const lastWordStart =
                    displayText.lastIndexOf(" ") + 1;
                  const inLastWord =
                    alignment.promptCursor >= lastWordStart;
                  if (inLastWord) {
                    setIncorrectKeystrokes((c) => c + 1);
                  }
                }
              }
            }}
            onPaste={(e) => e.preventDefault()}
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            onSelect={(e) => {
              const el = e.target as HTMLTextAreaElement;
              el.setSelectionRange(el.value.length, el.value.length);
            }}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            dir="ltr"
            className={cn(
              "absolute inset-0 w-full h-full resize-none rounded-md select-none typing-input-no-select cursor-default",
              "text-inherit leading-inherit font-mono text-left p-0",
              "bg-transparent text-transparent caret-transparent border-none outline-none",
              "placeholder:opacity-0"
            )}
            placeholder="Start typing..."
            spellCheck={false}
            autoFocus
            rows={3}
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground">
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-wider">WPM</span>
          <HoverCard openDelay={50} closeDelay={100}>
            <HoverCardTrigger asChild>
              <span className="text-3xl font-bold text-foreground cursor-default">
                {Math.max(0, Math.round(wpm))}
              </span>
            </HoverCardTrigger>
            <HoverCardContent className="flex w-32 flex-col items-center">
              <span className="text-sm font-mono">
                {wpm.toFixed(2)} wpm
              </span>
            </HoverCardContent>
          </HoverCard>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-wider">Raw WPM</span>
          <HoverCard openDelay={50} closeDelay={100}>
            <HoverCardTrigger asChild>
              <span className="text-3xl font-bold text-foreground cursor-default">
                {Math.max(0, Math.round(rawWpm))}
              </span>
            </HoverCardTrigger>
            <HoverCardContent className="flex w-48 flex-col gap-1">
              <span className="text-sm font-mono">
                {rawWpm.toFixed(2)} raw wpm
              </span>
              <span className="text-sm font-mono text-muted-foreground">
                (typed - extra) ÷ 5 ÷ time
              </span>
            </HoverCardContent>
          </HoverCard>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-wider">Accuracy</span>
          <HoverCard openDelay={50} closeDelay={100}>
            <HoverCardTrigger asChild>
              <span className="text-3xl font-bold text-foreground cursor-default">
                {Math.round(
                  computeAccuracy(correctKeystrokes, incorrectKeystrokes)
                )}
                %
              </span>
            </HoverCardTrigger>
            <HoverCardContent className="flex w-48 flex-col gap-1">
              <span className="text-sm font-mono">
                {computeAccuracy(
                  correctKeystrokes,
                  incorrectKeystrokes
                ).toFixed(2)}
                %
              </span>
              <span className="text-sm font-mono text-muted-foreground">
                {correctKeystrokes} correct / {incorrectKeystrokes} incorrect
              </span>
            </HoverCardContent>
          </HoverCard>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-wider">Time</span>
          <HoverCard openDelay={50} closeDelay={100}>
            <HoverCardTrigger asChild>
              <span className="text-3xl font-bold text-foreground cursor-default">
                {Math.max(0, Math.floor(timeDisplaySeconds))}s
              </span>
            </HoverCardTrigger>
            <HoverCardContent className="flex w-32 flex-col items-center">
              <span className="text-sm font-mono">
                {elapsedSeconds.toFixed(2)}s
              </span>
            </HoverCardContent>
          </HoverCard>
        </div>
        {mode === "words" && (
          <div className="flex flex-col items-center">
            <span className="text-xs uppercase tracking-wider">Progress</span>
            <span className="text-3xl font-bold text-foreground">0/{wordCount}</span>
          </div>
        )}
      </div>

      <div className="mt-4 p-3 rounded border border-border bg-muted/30 font-mono text-xs overflow-x-auto">
        <div className="font-semibold text-muted-foreground mb-1">Debug</div>
        <div className="grid gap-1">
          <div>
            <span className="text-muted-foreground">promptCursor:</span>{" "}
            {alignment.promptCursor} / {displayText.length}
          </div>
          <div>
            <span className="text-muted-foreground">input length:</span>{" "}
            {alignment.inputCursor}
          </div>
          <div>
            <span className="text-muted-foreground">raw chars:</span>{" "}
            {Math.max(0, rawInput.length - alignment.cells.filter((c) => c.type === "extra").length)}
          </div>
          <div>
            <span className="text-muted-foreground">chars (correct):</span>{" "}
            {correctCharsSoFar}
          </div>
          <div>
            <span className="text-muted-foreground">checkpointInputIndex:</span>{" "}
            {checkpointInputIndex}
          </div>
          <div>
            <span className="text-muted-foreground">rawInput:</span>{" "}
            {JSON.stringify(rawInput)}
          </div>
          <div>
            <span className="text-muted-foreground">cursorCellIndex:</span>{" "}
            {alignment.cursorCellIndex}
          </div>
          <div>
            <span className="text-muted-foreground">accuracy:</span>{" "}
            {correctKeystrokes} correct / {incorrectKeystrokes} incorrect
          </div>
        </div>
      </div>

    </div>
  );
}
