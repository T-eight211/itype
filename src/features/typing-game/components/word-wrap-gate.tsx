"use client";

import { useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { flushSync } from "react-dom";
import { computeAlignment } from "../lib/alignment";
import { TypingTextDisplay } from "./typing-text-display";

export type WordWrapGateFn = (nextInput: string) => boolean;

/**
 * Invisible mirror of the typing line layout. Exposes a synchronous gate that returns true when
 * appending a character would move the active `whitespace-nowrap` word to a lower line (Monkeytype-style wrap clamp).
 */
export function WordWrapProbe({
  gateRef,
  displayText,
  rawInput,
  isGameEnded,
  isInputFocused,
}: {
  gateRef: MutableRefObject<WordWrapGateFn | null>;
  displayText: string;
  rawInput: string;
  isGameEnded: boolean;
  isInputFocused: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [probeInput, setProbeInput] = useState<string | null>(null);

  const effectiveInput = probeInput ?? rawInput;
  const alignment = computeAlignment(displayText, effectiveInput);

  useLayoutEffect(() => {
    gateRef.current = (next: string) => {
      const root = containerRef.current;
      if (!root || isGameEnded || !displayText) return false;

      const readActiveWordTop = (): number | null => {
        const el = root.querySelector("[data-typing-active-word]");
        if (!(el instanceof HTMLElement)) return null;
        return el.getBoundingClientRect().top;
      };

      const measureTop = (input: string) => {
        flushSync(() => {
          setProbeInput(input);
        });
        return readActiveWordTop();
      };

      const before = measureTop(rawInput);
      const after = measureTop(next);

      flushSync(() => {
        setProbeInput(null);
      });

      if (before == null || after == null) return false;
      return after > before + 0.5;
    };

    return () => {
      gateRef.current = null;
    };
  }, [displayText, rawInput, isGameEnded]);

  return (
    <div
      ref={containerRef}
      className={[
        "absolute top-0 left-0 w-full pointer-events-none invisible",
        "text-xl md:text-2xl leading-relaxed font-mono text-left",
        "whitespace-pre-wrap",
      ].join(" ")}
      style={{ wordBreak: "keep-all", overflowWrap: "break-word" }}
      aria-hidden
    >
      <TypingTextDisplay
        alignment={alignment}
        displayText={displayText}
        isGameEnded={isGameEnded}
        isInputFocused={isInputFocused}
        markActiveWord
      />
    </div>
  );
}
