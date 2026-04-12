"use client";

import type { ReactNode } from "react";
import type { AlignmentCell, AlignmentResult } from "../lib/alignment";

export type TypingSegment = { word: boolean; start: number; end: number };

function getCh(cell: AlignmentCell, displayText: string) {
  return cell.type === "prompt" ? displayText[cell.index] : cell.char;
}

export function buildTypingSegments(alignment: AlignmentResult, displayText: string): TypingSegment[] {
  const segments: TypingSegment[] = [];
  let i = 0;
  while (i < alignment.cells.length) {
    const cell = alignment.cells[i];
    const ch = getCh(cell, displayText);
    if (ch === " ") {
      segments.push({ word: false, start: i, end: i + 1 });
      i += 1;
    } else {
      const start = i;
      while (i < alignment.cells.length && getCh(alignment.cells[i], displayText) !== " ") i++;
      segments.push({ word: true, start, end: i });
    }
  }
  return segments;
}

/** Segment index of the word being typed (including skipped tail of that word). */
export function getActiveWordSegmentIndex(alignment: AlignmentResult, displayText: string): number | null {
  const segments = buildTypingSegments(alignment, displayText);
  const cc = alignment.cursorCellIndex;

  for (let si = 0; si < segments.length; si++) {
    const s = segments[si];
    if (s.word && cc >= s.start && cc < s.end) return si;
  }

  for (let si = 0; si < segments.length; si++) {
    const s = segments[si];
    if (!s.word && cc >= s.start && cc < s.end) {
      for (let j = si + 1; j < segments.length; j++) {
        if (segments[j].word) return j;
      }
      return null;
    }
  }

  if (cc === -1) {
    const idx = segments.findIndex((s) => s.word);
    return idx >= 0 ? idx : null;
  }

  return null;
}

export function TypingTextDisplay({
  alignment,
  displayText,
  isGameEnded,
  isInputFocused,
  markActiveWord = false,
}: {
  alignment: AlignmentResult;
  displayText: string;
  isGameEnded: boolean;
  isInputFocused: boolean;
  /** When true, the active word span gets `data-typing-active-word` for layout probes. */
  markActiveWord?: boolean;
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

  const segments = buildTypingSegments(alignment, displayText);
  const activeSegIdx = markActiveWord ? getActiveWordSegmentIndex(alignment, displayText) : null;

  const cursorBlinker = (
    <span
      className="absolute left-0 top-0 w-0.5 h-full bg-yellow-500"
      style={{
        animation:
          !isGameEnded && isInputFocused ? "cursor-blink 1s step-end infinite" : "none",
        opacity: !isGameEnded && isInputFocused ? 1 : 0,
      }}
      aria-hidden
    />
  );

  const out: ReactNode[] = [];

  if (alignment.cursorCellIndex === -1) {
    out.push(
      <span key="cursor-start" className="inline-block w-0 h-[1em] align-middle relative shrink-0">
        {cursorBlinker}
      </span>
    );
  }

  segments.forEach((seg, segIdx) => {
    if (seg.word) {
      const chars: ReactNode[] = [];
      for (let j = seg.start; j < seg.end; j++) {
        const cell = alignment.cells[j];
        chars.push(
          <span key={j} className={getClass(cell)}>
            {getCh(cell, displayText)}
          </span>
        );
        if (j === alignment.cursorCellIndex) {
          chars.push(
            <span key={`cur-${j}`} className="inline-block w-0 h-[1em] align-middle relative shrink-0">
              {cursorBlinker}
            </span>
          );
        }
      }
      out.push(
        <span
          key={`w-${segIdx}`}
          className="whitespace-nowrap"
          {...(markActiveWord && segIdx === activeSegIdx ? { "data-typing-active-word": "" } : {})}
        >
          {chars}
        </span>
      );
    } else {
      const j = seg.start;
      const cell = alignment.cells[j];
      out.push(
        <span key={`s-${segIdx}`} className={getClass(cell)}>
          {" "}
        </span>
      );
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
