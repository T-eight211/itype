"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { Separator } from "@/components/ui/separator";
import { Clock, Type, Quote, Hash, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import englishWords from "@/data/languages/english.json";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const wrapContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollAnchorRef = useRef<number | null>(null);

  type AlignmentCell =
    | { type: "prompt"; index: number; inputIndex: number | null; status: "correct" | "wrong" | "skipped" }
    | { type: "extra"; inputIndex: number; char: string };

  type AlignmentResult = {
    cells: AlignmentCell[];   // in visual order
    promptCursor: number;     // index of next prompt char
    inputCursor: number;      // rawInput.length
    cursorCellIndex: number;  // index into cells where cursor should appear after
  };

  function computeAlignment(prompt: string, input: string): AlignmentResult {
    const cells: AlignmentCell[] = [];
    let pi = 0; // prompt index
    let ii = 0; // input index
    let cursorCellIndex = -1;

    while (ii < input.length) {
      const c = input[ii];
      const expected = pi < prompt.length ? prompt[pi] : null;

      if (expected !== null && c === expected) {
        // correct
        cells.push({ type: "prompt", index: pi, inputIndex: ii, status: "correct" });
        pi++;
        ii++;
        cursorCellIndex = cells.length - 1;
      } else if (expected !== null && expected !== " " && c === " ") {
        // space mid-word => skip rest of word up to next space, then align space if present
        while (pi < prompt.length && prompt[pi] !== " ") {
          cells.push({ type: "prompt", index: pi, inputIndex: null, status: "skipped" });
          pi++;
        }
        if (pi < prompt.length && prompt[pi] === " ") {
          cells.push({ type: "prompt", index: pi, inputIndex: ii, status: "correct" });
          pi++;
        }
        ii++; // consume input space
        cursorCellIndex = cells.length - 1;
      } else if (expected === null || expected === " ") {
        // extra input (beyond prompt or at word end) => extra cell
        cells.push({ type: "extra", inputIndex: ii, char: c });
        ii++;
        cursorCellIndex = cells.length - 1;
      } else {
        // wrong letter vs prompt letter
        cells.push({ type: "prompt", index: pi, inputIndex: ii, status: "wrong" });
        pi++;
        ii++;
        cursorCellIndex = cells.length - 1;
      }
    }

    const promptCursorConsumed = pi; // how much prompt was consumed by input (for game end / next-char index)

    // remaining prompt chars after input -> all "skipped"/untyped (muted)
    while (pi < prompt.length) {
      cells.push({ type: "prompt", index: pi, inputIndex: null, status: "skipped" });
      pi++;
    }

    return { cells, promptCursor: promptCursorConsumed, inputCursor: input.length, cursorCellIndex };
  }

  const alignment = React.useMemo(
    () => computeAlignment(displayText, rawInput),
    [displayText, rawInput]
  );

  const checkpointInputIndex = React.useMemo(() => {
    // Build maps from prompt index -> cell, and extras by input index
    const promptCellByIndex = new Map<number, AlignmentCell>();
    const extraInputIndices = new Set<number>();
    // Map input index -> prompt index for spaces
    const inputSpaceToPromptIndex = new Map<number, number>();

    alignment.cells.forEach((cell) => {
      if (cell.type === "prompt") {
        if (!promptCellByIndex.has(cell.index)) {
          promptCellByIndex.set(cell.index, cell);
        }
        // Track spaces: if this is a space and it's correct, map input index -> prompt index
        if (displayText[cell.index] === " " && cell.status === "correct" && cell.inputIndex != null) {
          inputSpaceToPromptIndex.set(cell.inputIndex, cell.index);
        }
      } else {
        extraInputIndices.add(cell.inputIndex);
      }
    });

    let checkpoint = 0;

    // Iterate through input spaces to check if the previous word is fully correct
    for (let inputIdx = 0; inputIdx < rawInput.length; inputIdx++) {
      if (rawInput[inputIdx] !== " ") continue;

      // Found a space at inputIdx. Check the word before this space.
      // Find the prompt index of this space
      const promptSpaceIdx = inputSpaceToPromptIndex.get(inputIdx);
      if (promptSpaceIdx == null) continue; // This space doesn't align with prompt

      // Find the start of the word before this space in the prompt
      let wordStart = promptSpaceIdx - 1;
      while (wordStart >= 0 && displayText[wordStart] !== " ") {
        wordStart--;
      }
      wordStart++; // Now points to first char of word
      const wordEnd = promptSpaceIdx; // exclusive, points to the space

      // Check if all letters in this word are correct
      let ok = true;
      let minIn = Infinity;
      let maxIn = -1;

      for (let j = wordStart; j < wordEnd; j++) {
        const cell = promptCellByIndex.get(j);
        if (!cell || cell.type !== "prompt" || cell.status !== "correct" || cell.inputIndex == null) {
          ok = false;
          break;
        }
        minIn = Math.min(minIn, cell.inputIndex);
        maxIn = Math.max(maxIn, cell.inputIndex);
      }

      if (!ok) continue; // Word has wrong or missing characters

      // Check for extra characters inside the word's input span
      for (const ei of extraInputIndices) {
        if (ei >= minIn && ei <= maxIn) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      // Check for extra characters between the word end and this space
      for (const ei of extraInputIndices) {
        if (ei > maxIn && ei < inputIdx) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      // All checks passed! This word is fully correct, checkpoint is after this space
      checkpoint = Math.max(checkpoint, inputIdx + 1);
    }

    return checkpoint;
  }, [alignment, displayText, rawInput]);

  const isLastWordFullyCorrect = React.useMemo(() => {
    if (displayText.length === 0 || alignment.promptCursor < displayText.length) return false;
    const lastSpace = displayText.lastIndexOf(" ");
    const lastWordStart = lastSpace === -1 ? 0 : lastSpace + 1;
    const lastWordEnd = displayText.length;
    const promptCellByIndex = new Map<number, AlignmentCell>();
    const extraInputIndices = new Set<number>();
    alignment.cells.forEach((cell) => {
      if (cell.type === "prompt") promptCellByIndex.set(cell.index, cell);
      else extraInputIndices.add(cell.inputIndex);
    });
    let minIn = Infinity;
    let maxIn = -1;
    for (let j = lastWordStart; j < lastWordEnd; j++) {
      const cell = promptCellByIndex.get(j);
      if (!cell || cell.type !== "prompt" || cell.status !== "correct" || cell.inputIndex == null) return false;
      minIn = Math.min(minIn, cell.inputIndex);
      maxIn = Math.max(maxIn, cell.inputIndex);
    }
    for (const ei of extraInputIndices) {
      if (ei >= minIn && ei <= maxIn) return false;
    }
    return true;
  }, [alignment, displayText]);

  const isGameEnded = React.useMemo(
    () =>
      displayText.length > 0 &&
      rawInput.length > 0 &&
      alignment.promptCursor >= displayText.length &&
      (rawInput.endsWith(" ") || isLastWordFullyCorrect),
    [displayText.length, rawInput.length, alignment.promptCursor, rawInput, isLastWordFullyCorrect]
  );

  const measureStr = React.useMemo(
    () =>
      alignment.cells
        .map((cell) =>
          cell.type === "prompt" ? displayText[cell.index] : cell.char
        )
        .join(""),
    [alignment, displayText]
  );

  const generateWords = (count: number) => {
    const words: string[] = [];
    for (let i = 0; i < count; i++) {
      const randomIndex = Math.floor(Math.random() * englishWords.words.length);
      words.push(englishWords.words[randomIndex]);
    }
    return words.join(" ");
  };

  const addPunctuation = (text: string) => {
    const sentences = text.split(" ");
    let result = "";
    for (let i = 0; i < sentences.length; i++) {
      result += sentences[i];
      if (i < sentences.length - 1) {
        const random = Math.random();
        if (random < 0.1) result += ",";
        else if (random < 0.15) result += ".";
        result += " ";
      }
    }
    return result + ".";
  };

  const addNumbers = (text: string) => {
    const words = text.split(" ");
    const numWords = Math.floor(words.length * 0.1);
    for (let i = 0; i < numWords; i++) {
      const randomIndex = Math.floor(Math.random() * words.length);
      words[randomIndex] = Math.floor(Math.random() * 1000).toString();
    }
    return words.join(" ");
  };

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
    } else if (mode === "quote") {
      setDisplayText("Quote mode coming soon...");
      setRawInput("");
    }
  }, [mode, wordCount, punctuation, numbers]);

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

    // Don't scroll if cursor is at or before the start of line 3
    // Add a small buffer: only scroll when we're at least 1 character INTO line 3
    // This prevents scrolling when a space wraps to line 2
    if (cursorMeasureIndex <= startOfLine3) {
      // Cursor moved back above the threshold; allow future scroll again.
      if (cursorMeasureIndex < startOfLine3) {
        lastScrollAnchorRef.current = null;
      }
      return;
    }

    // Only scroll once when we first cross into the "third line" region.
    if (hasScrolledForThisRegion) return;
    
    // Additional check: if cursor is right at startOfLine3 + 1, check if it's a space
    // that just wrapped. If so, wait until we type an actual character.
    if (cursorMeasureIndex === startOfLine3 + 1 && measureStr.length > startOfLine3) {
      const charBeforeCursor = measureStr[startOfLine3];
      // If the character at startOfLine3 is a space and it's a line break, don't scroll yet
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
        <div className="relative w-full min-h-18 select-none cursor-default" dir="ltr">
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
              // Group by word so a word never breaks across lines; only color inside each word.
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
                <span className="absolute left-0 top-0 w-0.5 h-full bg-yellow-500" style={{ animation: isInputFocused ? "cursor-blink 1s step-end infinite" : "none", opacity: isInputFocused ? 1 : 0 }} aria-hidden />
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
              setRawInput(next);
            }}
            onKeyDown={(e) => {
              // Prevent Enter from inserting newlines
              if (e.key === "Enter") {
                e.preventDefault();
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
          <span className="text-3xl font-bold text-foreground">0</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-wider">Accuracy</span>
          <span className="text-3xl font-bold text-foreground">100%</span>
        </div>
        {mode === "time" && (
          <div className="flex flex-col items-center">
            <span className="text-xs uppercase tracking-wider">Time</span>
            <span className="text-3xl font-bold text-foreground">{timerDuration}s</span>
          </div>
        )}
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
        </div>
      </div>

    </div>
  );
}
