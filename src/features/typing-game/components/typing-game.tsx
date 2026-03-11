"use client";

import React from "react";
import { Separator } from "@/components/ui/separator";
import { Clock, Type, Quote, Hash, AtSign, RotateCcw, Repeat, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

import { type AlignmentCell } from "../lib/alignment";
import { mean, stdDev } from "../utils/stats";
import { useTypingGame } from "../hooks/use-typing-game";
import { useLineMeasurement } from "../hooks/use-line-measurement";
import { ResultGraph } from "./result-graph";

export function TypingGame() {
  const game = useTypingGame();
  const { measureRef, wrapContainerRef, scrollContainerRef } = useLineMeasurement({
    measureStr: game.measureStr,
    cursorCellIndex: game.alignment.cursorCellIndex,
    settingsKey: game.settingsKey,
  });

  return (
    <div className="container grid grid-rows-[auto_1fr_auto] gap-6 min-h-[calc(100vh-8rem)]">

      {/* ── Mode & settings toolbar ── */}
      <div className="flex items-center justify-center gap-3">
        <ToggleGroup
          type="single"
          value={game.mode}
          onValueChange={(v) => v && game.setMode(v as typeof game.mode)}
        >
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

        {game.mode === "words" && (
          <ToggleGroup
            type="single"
            value={game.wordCount}
            onValueChange={(v) => v && game.setWordCount(v)}
          >
            <ToggleGroupItem value="10">10</ToggleGroupItem>
            <ToggleGroupItem value="25">25</ToggleGroupItem>
            <ToggleGroupItem value="50">50</ToggleGroupItem>
            <ToggleGroupItem value="100">100</ToggleGroupItem>
          </ToggleGroup>
        )}

        {game.mode === "time" && (
          <ToggleGroup
            type="single"
            value={game.timerDuration}
            onValueChange={(v) => v && game.setTimerDuration(v)}
          >
            <ToggleGroupItem value="15">15</ToggleGroupItem>
            <ToggleGroupItem value="30">30</ToggleGroupItem>
            <ToggleGroupItem value="60">60</ToggleGroupItem>
            <ToggleGroupItem value="120">120</ToggleGroupItem>
          </ToggleGroup>
        )}

        {game.mode === "quote" && (
          <ToggleGroup
            type="single"
            value={game.quoteLength}
            onValueChange={(v) => v && game.setQuoteLength(v as typeof game.quoteLength)}
          >
            <ToggleGroupItem value="all">all</ToggleGroupItem>
            <ToggleGroupItem value="short">short</ToggleGroupItem>
            <ToggleGroupItem value="medium">medium</ToggleGroupItem>
            <ToggleGroupItem value="long">long</ToggleGroupItem>
            <ToggleGroupItem value="thicc">thicc</ToggleGroupItem>
          </ToggleGroup>
        )}

        {(game.mode === "words" || game.mode === "time") && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <ToggleGroup
              type="multiple"
              value={[
                game.punctuation ? "punctuation" : "",
                game.numbers ? "numbers" : "",
              ].filter(Boolean)}
            >
              <ToggleGroupItem
                value="punctuation"
                aria-label="Toggle punctuation"
                onClick={() => game.setPunctuation(!game.punctuation)}
              >
                <AtSign className="w-4 h-4" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="numbers"
                aria-label="Toggle numbers"
                onClick={() => game.setNumbers(!game.numbers)}
              >
                <Hash className="w-4 h-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </>
        )}

        <Separator orientation="vertical" className="h-6" />

        {/* Test control buttons */}
        {!game.isGameEnded && (
          <Button
            size="icon-sm"
            variant="outline"
            onClick={game.restartTest}
            title="restart test"
            aria-label="restart test"
            className="transition-colors hover:bg-muted"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        )}

        {game.isGameEnded && (
          <div className="flex items-center gap-2">
            <Button
              size="icon-sm"
              variant="outline"
              onClick={game.retakeTest}
              title="retake test"
              aria-label="retake test"
              className="transition-colors hover:bg-muted"
            >
              <Repeat className="w-4 h-4" />
            </Button>
            <Button
              size="icon-sm"
              onClick={game.nextTest}
              title="next test"
              aria-label="next test"
              className="transition-colors"
            >
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* ── Typing area ── */}
      <div className="flex items-center justify-start w-full cursor-default" ref={wrapContainerRef}>
        <div
          className="relative w-full min-h-18 select-none cursor-default"
          dir="ltr"
          onMouseDown={(e) => {
            e.preventDefault();
            game.textareaRef.current?.focus();
          }}
        >
          {/* Hidden measure element */}
          <div
            ref={measureRef}
            className={cn(
              "absolute top-0 left-0 text-xl md:text-2xl leading-relaxed font-mono text-left w-full",
              "whitespace-pre-wrap pointer-events-none invisible"
            )}
            style={{ wordBreak: "keep-all", overflowWrap: "break-word" }}
            aria-hidden
          >
            {game.measureStr}
          </div>

          <style>{`.typing-game-scroll-hide{scrollbar-width:none;-ms-overflow-style:none}.typing-game-scroll-hide::-webkit-scrollbar{display:none}`}</style>

          {/* Visible text display */}
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
              style={{
                wordBreak: "keep-all",
                overflowWrap: "break-word",
                minHeight: "calc(4 * 1.625 * 1em)",
              }}
            >
              <TextDisplay
                alignment={game.alignment}
                displayText={game.displayText}
                isGameEnded={game.isGameEnded}
                isInputFocused={game.isInputFocused}
              />
            </div>
          </div>

          {/* Hidden textarea for input capture */}
          <textarea
            ref={game.textareaRef}
            value={game.rawInput}
            readOnly={game.isGameEnded}
            onChange={game.handleInputChange}
            onKeyDown={game.handleKeyDown}
            onPaste={(e) => e.preventDefault()}
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            onSelect={(e) => {
              const el = e.target as HTMLTextAreaElement;
              el.setSelectionRange(el.value.length, el.value.length);
            }}
            onFocus={() => game.setIsInputFocused(true)}
            onBlur={() => game.setIsInputFocused(false)}
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

      {/* ── Stats bar ── */}
      <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground">
        <StatItem label="WPM" value={Math.max(0, Math.round(game.wpm))} hoverValue={`${game.wpm.toFixed(2)} wpm`} />
        <StatItem label="Raw" value={Math.max(0, Math.round(game.rawWpm))} hoverValue={`${game.rawWpm.toFixed(2)} wpm`} />
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-wider">Accuracy</span>
          <HoverCard openDelay={50} closeDelay={100}>
            <HoverCardTrigger asChild>
              <span className="text-3xl font-bold text-foreground cursor-default">
                {Math.round(game.accuracy)}%
              </span>
            </HoverCardTrigger>
            <HoverCardContent className="flex w-40 flex-col gap-1">
              <span className="text-sm font-mono">{game.accuracy.toFixed(2)}%</span>
              <span className="text-sm font-mono">{game.correctKeystrokes} correct</span>
              <span className="text-sm font-mono">{game.incorrectKeystrokes} incorrect</span>
            </HoverCardContent>
          </HoverCard>
        </div>

        {game.consistency !== null && (
          <StatItem
            label="Consistency"
            value={`${Math.round(game.consistency)}%`}
            hoverValue={`${game.consistency.toFixed(2)}%`}
          />
        )}

        <StatItem
          label="Time"
          value={`${Math.max(0, Math.round(game.timeDisplaySeconds))}s`}
          hoverValue={`${game.elapsedSeconds.toFixed(2)}s`}
        />

        {(game.mode === "words" || game.mode === "quote") && (
          <div className="flex flex-col items-center">
            <span className="text-xs uppercase tracking-wider">Progress</span>
            <span className="text-3xl font-bold text-foreground">
              {game.completedWordsCount}/{game.totalWordsCount}
            </span>
          </div>
        )}
      </div>

      {/* ── Result graph ── */}
      {game.isGameEnded && game.wpmHistory.length > 0 && (
        <ResultGraph
          wpmHistory={game.wpmHistory}
          rawWpmHistory={game.rawWpmHistory}
          burstWpm={game.burstWpm}
          wpm={game.wpm}
          rawWpm={game.rawWpm}
          accuracy={game.accuracy}
          correctKeystrokes={game.correctKeystrokes}
          incorrectKeystrokes={game.incorrectKeystrokes}
          incorrectHistory={game.incorrectHistory}
          consistency={game.consistency}
          elapsedSeconds={game.elapsedSeconds}
          mode={game.mode}
        />
      )}

      {/* ── Debug panel ── */}
      <div className="mt-4 p-3 rounded border border-border bg-muted/30 font-mono text-xs overflow-x-auto">
        <div className="font-semibold text-muted-foreground mb-1">Debug</div>
        <div className="grid gap-1">
          <DebugRow label="promptCursor" value={`${game.alignment.promptCursor} / ${game.displayText.length}`} />
          <DebugRow label="input length" value={game.alignment.inputCursor} />
          <DebugRow
            label="raw chars"
            value={Math.max(0, game.rawInput.length - game.alignment.cells.filter((c) => c.type === "extra").length)}
          />
          <DebugRow label="chars (correct)" value={game.correctCharsSoFar} />
          <DebugRow label="rawInput" value={JSON.stringify(game.rawInput)} />
          <DebugRow label="cursorCellIndex" value={game.alignment.cursorCellIndex} />
          <DebugRow label="accuracy" value={`${game.correctKeystrokes} correct / ${game.incorrectKeystrokes} incorrect`} />

          {game.burstWpm.length > 0 && (
            <>
              <DebugRow label="burstWpm" value={`[${game.burstWpm.join(", ")}]`} />
              <DebugRow label="wpmHistory" value={`[${game.wpmHistory.join(", ")}]`} />
              <DebugRow label="rawWpmHistory" value={`[${game.rawWpmHistory.join(", ")}]`} />
              <DebugRow label="incorrectHistory" value={`[${game.incorrectHistory.join(", ")}]`} />
              <DebugRow label="burst mean" value={mean(game.burstWpm).toFixed(2)} />
              <DebugRow label="burst stdDev" value={stdDev(game.burstWpm).toFixed(2)} />
              <DebugRow
                label="burst CV"
                value={
                  mean(game.burstWpm) === 0
                    ? "—"
                    : (stdDev(game.burstWpm) / mean(game.burstWpm)).toFixed(4)
                }
              />
            </>
          )}
        </div>
      </div>
      

    </div>
  );
}

// ── Extracted sub-components ──

function StatItem({
  label,
  value,
  hoverValue,
}: {
  label: string;
  value: React.ReactNode;
  hoverValue: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs uppercase tracking-wider">{label}</span>
      <HoverCard openDelay={50} closeDelay={100}>
        <HoverCardTrigger asChild>
          <span className="text-3xl font-bold text-foreground cursor-default">{value}</span>
        </HoverCardTrigger>
        <HoverCardContent className="flex w-32 flex-col items-center">
          <span className="text-sm font-mono">{hoverValue}</span>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}

function DebugRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span> {value}
    </div>
  );
}

function TextDisplay({
  alignment,
  displayText,
  isGameEnded,
  isInputFocused,
}: {
  alignment: ReturnType<typeof import("../lib/alignment").computeAlignment>;
  displayText: string;
  isGameEnded: boolean;
  isInputFocused: boolean;
}) {
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
}
