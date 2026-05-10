"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Clock, Type, Quote, Hash, AtSign, RotateCcw, Repeat, SkipForward, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

import { mean, stdDev } from "../utils/stats";
import { useTypingGame, type GameMode } from "../hooks/use-typing-game";
import { useLineMeasurement } from "../hooks/use-line-measurement";
import { ResultGraph } from "./result-graph";
import { TypingGameLayoutKeyboard } from "./typing-game-layout-keyboard";
import { useTypingGameKeymap } from "../hooks/use-typing-game-keymap";
import { TypingTextDisplay } from "./typing-text-display";
import { WordWrapProbe, type WordWrapGateFn } from "./word-wrap-gate";
import {
  getTypingCoachEligibilityAction,
  getTypingCoachFeedbackAction,
} from "@/features/typing-coach/server/typing-coach-actions";
import { TypingCoachFeedbackPanel } from "./typing-coach-feedback-panel";

type TypingGameProps = {
  urlMode?: GameMode | null;
};

type FeedbackApiState =
  | { status: "loading" }
  | { status: "pending"; run_id: number }
  | { status: "none" }
  | {
      status: "ready";
      run_id: number;
      items: { feedback_text: string; practice_words: string[] }[];
      created_at: string;
    }
  | { status: "error" };

const COACH_POPOVER_AUTO_CLOSE_MS = 10000;
const SHOW_DEBUG_PANEL = false;
const SHOW_WORD_MISTAKES_PANEL = false;

export function TypingGame({ urlMode = null }: TypingGameProps) {
  const keymap = useTypingGameKeymap();
  const wordWrapGateRef = useRef<WordWrapGateFn | null>(null);
  const streamedCoachFeedbackKeysRef = useRef<Set<string>>(new Set());
  const promptStreamIntervalRef = useRef<number | null>(null);
  const coachPopoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coachPopoverHoverLockRef = useRef(false);
  const [coachMode, setCoachMode] = useState(false);
  const [coachPopoverOpen, setCoachPopoverOpen] = useState(false);
  const [coachWords, setCoachWords] = useState<string[]>([]);
  const [coachFocusIndex, setCoachFocusIndex] = useState<number | null>(null);
  const [streamedPromptText, setStreamedPromptText] = useState("");
  const [isCoachPromptStreaming, setIsCoachPromptStreaming] = useState(false);
  const coachAppliedRunIdRef = useRef<number | null>(null);
  const [coachRegenLoading, setCoachRegenLoading] = useState(false);
  const [feedbackState, setFeedbackState] = useState<FeedbackApiState | null>(null);
  const [eligibilityState, setEligibilityState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready" }
    | {
        status: "insufficient";
        missing: { sessions_needed: number; non_pause_error_events_needed: number };
      }
    | { status: "unauthenticated" }
    | { status: "error" }
  >({ status: "idle" });

  const game = useTypingGame(urlMode, {
    wordWrapGateRef,
    coachMode,
    coachPracticeWords: coachWords,
  });

  useEffect(() => {
    if (coachMode && game.mode === "quote") {
      game.setMode("words");
    }
  }, [coachMode, game.mode, game.setMode]);

  useEffect(() => {
    if (!coachMode) {
      coachAppliedRunIdRef.current = null;
      setCoachFocusIndex(null);
      setCoachWords([]);
    }
  }, [coachMode]);

  useEffect(() => {
    if (!coachMode) return;
    if (feedbackState?.status !== "ready") return;
    const { run_id, items } = feedbackState;
    if (items.length === 0) {
      setCoachFocusIndex(null);
      setCoachWords([]);
      return;
    }
    const applied = coachAppliedRunIdRef.current;
    if (applied !== null && run_id < applied) return;
    if (applied !== null && run_id === applied) return;
    const idx = Math.floor(Math.random() * items.length);
    coachAppliedRunIdRef.current = run_id;
    setCoachFocusIndex(idx);
    setCoachWords(items[idx]!.practice_words);
  }, [coachMode, feedbackState]);

  useEffect(() => {
    if (!coachMode) return;
    let isCancelled = false;
    setEligibilityState({ status: "loading" });
    setFeedbackState({ status: "loading" });

    const run = async () => {
      try {
        const [el, fb] = await Promise.all([
          getTypingCoachEligibilityAction(),
          getTypingCoachFeedbackAction(),
        ]);
        if (isCancelled) return;

        if ("error" in el) {
          setEligibilityState({ status: "unauthenticated" });
        } else if (el.ready) {
          setEligibilityState({ status: "ready" });
        } else if ("missing" in el && el.missing) {
          setEligibilityState({ status: "insufficient", missing: el.missing });
        } else {
          setEligibilityState({ status: "error" });
        }

        if ("error" in fb) {
          setFeedbackState({ status: "error" });
        } else {
          setFeedbackState(fb);
        }
      } catch {
        if (!isCancelled) {
          setEligibilityState({ status: "error" });
          setFeedbackState({ status: "error" });
        }
      }
    };
    run();
    return () => {
      isCancelled = true;
    };
  }, [coachMode]);

  useEffect(() => {
    if (!coachMode || feedbackState?.status !== "pending") return;
    const id = window.setInterval(async () => {
      const data = await getTypingCoachFeedbackAction();
      if ("error" in data) return;
      setFeedbackState(data);
    }, 2500);
    return () => clearInterval(id);
  }, [coachMode, feedbackState?.status]);

  const aiHintMessage = useMemo(() => {
    if (eligibilityState.status === "idle") return "";
    if (eligibilityState.status === "loading") return "Checking AI readiness...";
    if (eligibilityState.status === "unauthenticated") {
      return "Sign in to unlock AI coaching and personalised feedback.";
    }
    if (eligibilityState.status === "error") return "Unable to check AI readiness right now.";
    if (eligibilityState.status === "ready") return "AI coaching is ready.";
    if (eligibilityState.missing.sessions_needed > 0) {
      return `Play ${eligibilityState.missing.sessions_needed} more game${eligibilityState.missing.sessions_needed === 1 ? "" : "s"} to unlock AI coaching.`;
    }
    return "You have enough sessions, but we need more error data before AI coaching can run.";
  }, [eligibilityState]);

  const feedbackPanelPayload = useMemo(() => {
    if (feedbackState === null || feedbackState.status === "loading") {
      return { status: "loading" as const };
    }
    if (feedbackState.status === "error") {
      return { status: "error" as const };
    }
    return feedbackState;
  }, [feedbackState]);

  const coachDisplayItem = useMemo(() => {
    if (feedbackState?.status !== "ready" || coachFocusIndex === null) return null;
    return feedbackState.items[coachFocusIndex] ?? null;
  }, [feedbackState, coachFocusIndex]);
  const selectedCoachFeedbackKey = useMemo(() => {
    if (!coachMode) return null;
    if (feedbackState?.status !== "ready" || coachFocusIndex === null) return null;
    return `${feedbackState.run_id}:${coachFocusIndex}`;
  }, [coachMode, feedbackState, coachFocusIndex]);

  const coachDebugInfo = useMemo(() => {
    if (feedbackState?.status !== "ready" || coachFocusIndex === null || !coachDisplayItem) {
      return "";
    }
    return `run=${feedbackState.run_id} item=${coachFocusIndex + 1}/${feedbackState.items.length} pool=${coachWords.length} mix=0.9 words=[${coachWords.join(", ")}]`;
  }, [feedbackState, coachFocusIndex, coachDisplayItem, coachWords]);

  const noneFallbackText = useMemo(() => {
    if (feedbackState?.status !== "none") return "";
    if (eligibilityState.status === "unauthenticated") {
      return "Sign in to unlock AI coaching and personalised feedback.";
    }
    if (eligibilityState.status === "insufficient") return aiHintMessage;
    if (eligibilityState.status === "ready") {
      return "No coaching feedback yet. Finish a session or check back shortly.";
    }
    return aiHintMessage;
  }, [feedbackState, eligibilityState, aiHintMessage]);

  const showEligibilityFallback = useMemo(() => {
    if (feedbackState?.status === "none") return true;
    if (eligibilityState.status === "unauthenticated") return true;
    return false;
  }, [feedbackState, eligibilityState.status]);

  const feedbackPopoverKey = useMemo(() => {
    if (!coachMode) return "";
    if (feedbackState === null) return "null";
    if (feedbackState.status === "loading") return "loading";
    if (feedbackState.status === "pending") return `pending-${feedbackState.run_id}`;
    if (feedbackState.status === "ready") {
      return `ready-${feedbackState.run_id}-${coachFocusIndex ?? "x"}`;
    }
    if (feedbackState.status === "none") return `none-${eligibilityState.status}`;
    if (feedbackState.status === "error") return `error-${eligibilityState.status}`;
    return "unknown";
  }, [coachMode, feedbackState, coachFocusIndex, eligibilityState.status]);

  const clearCoachPopoverTimer = useCallback(() => {
    if (coachPopoverTimerRef.current) {
      clearTimeout(coachPopoverTimerRef.current);
      coachPopoverTimerRef.current = null;
    }
  }, []);

  const scheduleCoachPopoverClose = useCallback(() => {
    clearCoachPopoverTimer();
    coachPopoverHoverLockRef.current = true;
    coachPopoverTimerRef.current = setTimeout(() => {
      setCoachPopoverOpen(false);
      coachPopoverHoverLockRef.current = false;
      coachPopoverTimerRef.current = null;
    }, COACH_POPOVER_AUTO_CLOSE_MS);
  }, [clearCoachPopoverTimer]);

  useEffect(() => {
    if (!coachMode) {
      clearCoachPopoverTimer();
      coachPopoverHoverLockRef.current = false;
      setCoachPopoverOpen(false);
      return;
    }
    setCoachPopoverOpen(true);
    scheduleCoachPopoverClose();
  }, [coachMode, feedbackPopoverKey, clearCoachPopoverTimer, scheduleCoachPopoverClose]);

  useEffect(() => {
    return () => clearCoachPopoverTimer();
  }, [clearCoachPopoverTimer]);

  const regenerateCoachAndGame = useCallback(async () => {
    if (!coachMode) return;
    setCoachRegenLoading(true);
    setFeedbackState({ status: "loading" });
    try {
      const data = await getTypingCoachFeedbackAction();
      if ("error" in data) return;
      setFeedbackState(data);
      if (data.status === "ready" && data.items.length > 0) {
        const current = coachFocusIndex;
        const nextIdx =
          data.items.length > 1 && current !== null
            ? (() => {
                let idx = Math.floor(Math.random() * data.items.length);
                if (idx === current) idx = (idx + 1) % data.items.length;
                return idx;
              })()
            : Math.floor(Math.random() * data.items.length);
        const item = data.items[nextIdx]!;
        setCoachFocusIndex(nextIdx);
        setCoachWords(item.practice_words);
        coachAppliedRunIdRef.current = data.run_id;
      }
    } finally {
      setCoachRegenLoading(false);
    }
  }, [coachMode, coachFocusIndex]);

  const handleRestartTest = useCallback(async () => {
    if (coachMode) await regenerateCoachAndGame();
    game.restartTest();
  }, [coachMode, regenerateCoachAndGame, game.restartTest]);

  const handleNextTest = useCallback(async () => {
    if (coachMode) await regenerateCoachAndGame();
    game.nextTest();
  }, [coachMode, regenerateCoachAndGame, game.nextTest]);

  const { measureRef, wrapContainerRef, scrollContainerRef } = useLineMeasurement({
    measureStr: game.measureStr,
    cursorCellIndex: game.alignment.cursorCellIndex,
    settingsKey: game.settingsKey,
  });

  const coachExercisePending = useMemo(() => {
    if (!coachMode) return false;
    if (game.mode === "quote") return true;
    if (feedbackState === null || feedbackState.status === "loading") return true;
    if (feedbackState.status === "pending") return true;
    if (feedbackState.status === "ready" && feedbackState.items.length > 0) {
      return coachFocusIndex === null || coachWords.length === 0;
    }
    return false;
  }, [coachMode, game.mode, feedbackState, coachFocusIndex, coachWords.length]);

  const isPromptLoading =
    coachRegenLoading || coachExercisePending || game.displayText.length === 0;

  useEffect(() => {
    return () => {
      if (promptStreamIntervalRef.current !== null) {
        window.clearInterval(promptStreamIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (promptStreamIntervalRef.current !== null) {
      window.clearInterval(promptStreamIntervalRef.current);
      promptStreamIntervalRef.current = null;
    }

    if (!coachMode || !selectedCoachFeedbackKey || isPromptLoading || game.displayText.length === 0) {
      setIsCoachPromptStreaming(false);
      setStreamedPromptText(game.displayText);
      return;
    }

    if (streamedCoachFeedbackKeysRef.current.has(selectedCoachFeedbackKey)) {
      setIsCoachPromptStreaming(false);
      setStreamedPromptText(game.displayText);
      return;
    }

    setIsCoachPromptStreaming(true);
    setStreamedPromptText("");
    let i = 0;
    const charsPerTick = 2;
    const id = window.setInterval(() => {
      i += charsPerTick;
      const next = game.displayText.slice(0, i);
      setStreamedPromptText(next);
      if (i >= game.displayText.length) {
        window.clearInterval(id);
        promptStreamIntervalRef.current = null;
        streamedCoachFeedbackKeysRef.current.add(selectedCoachFeedbackKey);
        setIsCoachPromptStreaming(false);
        setStreamedPromptText(game.displayText);
      }
    }, 10);
    promptStreamIntervalRef.current = id;

    return () => {
      window.clearInterval(id);
      if (promptStreamIntervalRef.current === id) {
        promptStreamIntervalRef.current = null;
      }
    };
  }, [coachMode, selectedCoachFeedbackKey, isPromptLoading, game.displayText]);

  return (
    <div className="container grid grid-rows-[auto_1fr_auto] gap-6 min-h-[calc(100vh-8rem)]">

      <div className="flex items-center justify-center gap-3">
        <HoverCard
          open={coachMode && coachPopoverOpen}
          onOpenChange={(open) => {
            if (!coachMode) {
              setCoachPopoverOpen(false);
              coachPopoverHoverLockRef.current = false;
              return;
            }
            if (coachPopoverHoverLockRef.current) {
              return;
            }
            setCoachPopoverOpen(open);
          
            if (!open) {
              clearCoachPopoverTimer();
            }
          }}
          openDelay={0}
          closeDelay={0}
        >
          <HoverCardTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                coachMode
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border/60 bg-muted/50"
              )}
              title="AI coaching"
              aria-label="AI coaching"
              aria-pressed={coachMode}
              aria-expanded={coachMode && coachPopoverOpen}
              onClick={() => {
                setCoachMode((prev) => !prev);
              }}
            >
              <Bot className="h-4 w-4" />
            </button>
          </HoverCardTrigger>
          <HoverCardContent
            align="start"
            side="bottom"
            sideOffset={8}
            className="w-auto max-w-xs border-border p-3 text-xs leading-relaxed"
            role="status"
          >
            <TypingCoachFeedbackPanel
              feedback={feedbackPanelPayload}
              selectedCoachItem={coachDisplayItem}
              streamResetKey={
                feedbackState?.status === "ready"
                  ? `${feedbackState.run_id}-${coachFocusIndex ?? ""}`
                  : "0"
              }
              eligibilityHint={noneFallbackText || aiHintMessage}
              showEligibilityFallback={showEligibilityFallback}
            />
          </HoverCardContent>
        </HoverCard>
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
          <ToggleGroupItem
            value="quote"
            aria-label="Quote mode"
            disabled={coachMode}
            className={coachMode ? "opacity-50" : undefined}
          >
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

        {!game.isGameEnded && (
          <Button
            size="icon-sm"
            variant="outline"
            onClick={() => void handleRestartTest()}
            disabled={coachRegenLoading}
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
              onClick={() => void handleNextTest()}
              disabled={coachRegenLoading}
              title="next test"
              aria-label="next test"
              className="transition-colors"
            >
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-start w-full cursor-default" ref={wrapContainerRef}>
        <div
          className="relative w-full min-h-18 select-none cursor-default"
          dir="ltr"
          onMouseDown={(e) => {
            e.preventDefault();
            game.focusTypingInput();
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
            {game.measureStr}
          </div>

          <WordWrapProbe
            gateRef={wordWrapGateRef}
            displayText={game.displayText}
            rawInput={game.rawInput}
            isGameEnded={game.isGameEnded}
            isInputFocused={game.isInputFocused}
          />

          <style>{`.typing-game-scroll-hide{scrollbar-width:none;-ms-overflow-style:none}.typing-game-scroll-hide::-webkit-scrollbar{display:none}`}</style>

          <div
            ref={scrollContainerRef}
            className={cn(
              game.isGameEnded
                ? "overflow-y-auto overflow-x-hidden"
                : "overflow-hidden",
              "select-none typing-game-scroll-hide cursor-default",
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
              {isPromptLoading ? (
                <div className="space-y-3 pt-1">
                  <Skeleton className="h-8 w-[92%]" />
                  <Skeleton className="h-8 w-[84%]" />
                  <Skeleton className="h-8 w-[88%]" />
                </div>
              ) : isCoachPromptStreaming ? (
                <p className="text-muted-foreground/70">{streamedPromptText}</p>
              ) : (
                <TypingTextDisplay
                  alignment={game.alignment}
                  displayText={game.displayText}
                  isGameEnded={game.isGameEnded}
                  isInputFocused={game.isInputFocused}
                />
              )}
            </div>
          </div>

          <textarea
            ref={game.textareaRef}
            value={game.rawInput}
            readOnly={game.isGameEnded || isCoachPromptStreaming}
            onChange={game.handleInputChange}
            onKeyDown={game.handleKeyDown}
            onKeyUp={game.handleKeyUp}
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
              "absolute top-0 -left-[9999px] overflow-hidden resize-none rounded-md select-none typing-input-no-select cursor-default", 
              // "absolute inset-0 w-full h-full resize-none rounded-md select-none typing-input-no-select cursor-default", //shows caps lock indicator of macos and autocomplete predictions extensions shows up
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
      <div className="mx-auto mt-2 h-5 w-full max-w-5xl">
        {!game.isGameEnded && game.isCapsLockOn ? (
          <p className="text-center text-sm font-medium text-amber-500">Caps Lock is ON</p>
        ) : null}
      </div>
      {keymap.status === "ready" &&
        keymap.settings.keymapDisplay !== "off" &&
        keymap.layout &&
        !game.isGameEnded && (
          <TypingGameLayoutKeyboard
            layout={keymap.layout}
            showTopRowSetting={keymap.settings.showTopRow}
            keymapDisplay={keymap.settings.keymapDisplay}
            testPromptContainsNumber={/\d/.test(game.displayText)}
            nextHighlightChar={
              keymap.settings.keymapDisplay === "next" ? game.keymapNextExpectedChar : null
            }
            reactFlashes={
              keymap.settings.keymapDisplay === "react" ? game.keymapReactFlashes : []
            }
            legendStyle={keymap.settings.legendStyle}
            keymapSize={keymap.settings.keymapSize}
            isCapsLockOn={game.isCapsLockOn}
            isShiftPressed={game.isShiftPressed}
            showHandsOverlay={
              keymap.settings.keymapDisplay === "next" &&
              keymap.layoutFileName === "qwerty" &&
              keymap.settings.showHandsOverlay
            }
          />
        )}

      {!(game.isGameEnded && game.wpmHistory.length > 0) && (
      <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground">
        <StatItem label="WPM" value={Math.max(0, Math.round(game.wpm))} hoverValue={`${game.wpmDisplay} wpm`} />
        <StatItem label="Raw" value={Math.max(0, Math.round(game.rawWpm))} hoverValue={`${game.rawWpmDisplay} wpm`} />
        <div className="flex flex-col items-center">
          <span className="text-xs uppercase tracking-wider">Accuracy</span>
          <HoverCard openDelay={50} closeDelay={100}>
            <HoverCardTrigger asChild>
              <span className="text-3xl font-bold text-foreground cursor-default">
                {Math.round(game.accuracy)}%
              </span>
            </HoverCardTrigger>
            <HoverCardContent className="flex w-40 flex-col gap-1">
              <span className="text-sm font-mono">{game.accuracyDisplay}%</span>
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
      )}

      {game.isGameEnded && game.wpmHistory.length > 0 && (
        <ResultGraph
          wpmHistory={game.wpmHistory}
          rawWpmHistory={game.rawWpmHistory}
          burstWpm={game.burstWpm}
          wpm={game.wpm}
          rawWpm={game.rawWpm}
          wpmDisplay={game.wpmDisplay}
          rawWpmDisplay={game.rawWpmDisplay}
          accuracy={game.accuracy}
          accuracyDisplay={game.accuracyDisplay}
          correctKeystrokes={game.correctKeystrokes}
          incorrectKeystrokes={game.incorrectKeystrokes}
          incorrectHistory={game.incorrectHistory}
          consistency={game.consistency}
          elapsedSeconds={game.elapsedSeconds}
          mode={game.mode}
        />
      )}

      {SHOW_DEBUG_PANEL ? (
        <div className="mt-4 rounded border border-border bg-muted/30 p-3 font-mono text-xs overflow-x-auto">
          <div className="mb-1 font-semibold text-muted-foreground">Debug</div>
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
            {coachDebugInfo && <DebugRow label="coach" value={coachDebugInfo} />}

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
      ) : null}

      {SHOW_WORD_MISTAKES_PANEL && game.isGameEnded && game.wordMistakes.length > 0 && (
        <div className="mt-4 p-3 rounded border border-border bg-muted/30 font-mono text-xs overflow-x-auto max-h-[60vh] overflow-y-auto">
          <div className="font-semibold text-muted-foreground mb-2">
            Word Mistakes ({game.wordMistakes.length})
          </div>
          <pre className="whitespace-pre-wrap wrap-break-word">
            {JSON.stringify(game.wordMistakes, null, 2)}
          </pre>
        </div>
      )}

    </div>
  );
}

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
