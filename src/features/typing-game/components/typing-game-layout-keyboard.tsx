"use client";

import { Keycap, KeyRow } from "@/components/ui/animated-keyboard";
import type { KeyboardLayoutData, KeyTuple } from "@/features/typing-game/lib/keyboard-layout-types";
import { computeKeymapTopRowVisible } from "@/features/typing-game/lib/compute-keymap-top-row-visible";
import { keyTupleMatchesChar } from "@/features/typing-game/lib/key-tuple-matches-char";
import type { KeymapReactFlash } from "@/features/typing-game/lib/keymap-react-flash";
import { TypingGameHandsOverlay } from "@/features/typing-game/components/typing-game-hands-overlay";
import type { KeymapDisplay, LegendStyle, ShowTopRow } from "@/features/settings/lib/user-settings";
import { cn } from "@/lib/utils";

const KEY_HEIGHT = "48px";

function rowPlClass(physicalRow: 1 | 2 | 3 | 4 | 5, layoutType: "ansi" | "iso") {
  if (physicalRow === 1) return "";
  if (physicalRow === 2) return "pl-[28px]";
  // Row 3 (home): same stagger for ANSI and ISO.
  if (physicalRow === 3) return "pl-[48px]";
  // Row 4: ISO bottom letter row lines up with row 2 (tab offset); ANSI keeps wider left shift.
  if (physicalRow === 4) return layoutType === "iso" ? "pl-[28px]" : "pl-[76px]";
  if (physicalRow === 5) return "pl-[192px]";
  return "";
}

function trimForDisplay(layout: KeyboardLayoutData) {
  const row1 = layout.keys.row1.length > 0 ? layout.keys.row1.slice(1) : [];
  const row2 =
    layout.keys.row2.length > 12
      ? layout.keys.row2.filter((_, i) => i !== 12)
      : layout.keys.row2;
  return {
    row1,
    row2,
    row3: layout.keys.row3,
    row4: layout.keys.row4,
    row5: layout.keys.row5,
  };
}

function legendToChar(
  key: KeyTuple,
  style: LegendStyle,
  isCapsLockOn: boolean,
  isShiftPressed: boolean
): string {
  const a = key[0] ?? "";
  if (a === " ") return "";

  const shiftedFromLayout = key[1]?.length ? key[1]! : null;
  const lower = a.length === 1 && /[a-zA-Z]/.test(a) ? a.toLowerCase() : a;
  const upper =
    shiftedFromLayout ??
    (a.length === 1 && /[a-zA-Z]/.test(a) ? a.toUpperCase() : a);

  switch (style) {
    case "blank":
      return "";
    case "lowercase":
      return lower;
    case "uppercase":
      return upper;
    case "dynamic": {
      if (shiftedFromLayout == null) {
        return a;
      }
      // A–Z: caps XOR shift picks base vs shift *legends from the layout JSON*, not toUpperCase().
      if (a.length === 1 && /[a-zA-Z]/.test(a)) {
        const useShiftedLayer = isCapsLockOn !== isShiftPressed;
        return useShiftedLayer ? shiftedFromLayout : a;
      }
      // Keys with a dedicated shift legend (digits, symbols, non‑ASCII letters, etc.).
      return isShiftPressed ? shiftedFromLayout : a;
    }
    default:
      return a;
  }
}

type RowEntry = { physicalRow: 1 | 2 | 3 | 4 | 5; keys: KeyTuple[] };

function buildRows(layout: KeyboardLayoutData, showNumberRow: boolean): RowEntry[] {
  const t = trimForDisplay(layout);
  const all: RowEntry[] = [
    { physicalRow: 1, keys: t.row1 },
    { physicalRow: 2, keys: t.row2 },
    { physicalRow: 3, keys: t.row3 },
    { physicalRow: 4, keys: t.row4 },
    { physicalRow: 5, keys: t.row5 },
  ];
  if (!showNumberRow) {
    return all.filter((r) => r.physicalRow !== 1);
  }
  return all;
}

type KeycapHighlight = "rgb" | "correct" | "incorrect" | null;

function keycapHighlight(
  keymapDisplay: KeymapDisplay,
  nextHighlightChar: string | null | undefined,
  reactFlashes: readonly KeymapReactFlash[],
  key: KeyTuple
): KeycapHighlight {
  if (keymapDisplay === "next") {
    if (!nextHighlightChar) return null;
    return keyTupleMatchesChar(key, nextHighlightChar) ? "rgb" : null;
  }
  if (keymapDisplay === "react") {
    const matching = reactFlashes.filter((f) => keyTupleMatchesChar(key, f.ch));
    if (matching.length === 0) return null;
    // Wrong keypress dominates over a concurrent correct one so errors stay visible.
    return matching.some((f) => f.kind === "incorrect") ? "incorrect" : "correct";
  }
  return null;
}

function highlightToKeylightColor(h: KeycapHighlight): "default" | "rgb" | "green" | "red" {
  if (h === "rgb") return "rgb";
  if (h === "correct") return "green";
  if (h === "incorrect") return "red";
  return "default";
}

function LayoutKeyRow({
  row,
  layoutType,
  legendStyle,
  isCapsLockOn,
  isShiftPressed,
  keymapDisplay,
  nextHighlightChar,
  reactFlashes,
}: {
  row: RowEntry;
  layoutType: "ansi" | "iso";
  legendStyle: LegendStyle;
  isCapsLockOn: boolean;
  isShiftPressed: boolean;
  keymapDisplay: KeymapDisplay;
  nextHighlightChar: string | null | undefined;
  reactFlashes: readonly KeymapReactFlash[];
}) {
  const pl = rowPlClass(row.physicalRow, layoutType);
  return (
    <KeyRow gap="md" className={pl}>
      {row.keys.map((key, idx) => {
        const keyId = `${row.physicalRow}-${idx}-${key[0] ?? "∅"}`;
        const highlight = keycapHighlight(keymapDisplay, nextHighlightChar, reactFlashes, key);
        const keylightColor = highlightToKeylightColor(highlight);
        const isHighlighted = highlight !== null;
        if ((key[0] ?? "") === " ") {
          return (
            <Keycap
              key={keyId}
              char=""
              variant="space"
              height={KEY_HEIGHT}
              className="w-[340px]"
              keylightColor={keylightColor}
              highlightFullKey={isHighlighted}
            />
          );
        }
        return (
          <Keycap
            key={keyId}
            char={legendToChar(key, legendStyle, isCapsLockOn, isShiftPressed)}
            height={KEY_HEIGHT}
            className="w-12"
            keylightColor={keylightColor}
            highlightFullKey={isHighlighted}
          />
        );
      })}
    </KeyRow>
  );
}

type Props = {
  layout: KeyboardLayoutData;
  /** User setting for top row visibility (combined with layout + “next” + numbers). */
  showTopRowSetting: ShowTopRow;
  keymapDisplay: KeymapDisplay;
  /** True when the current test prompt text contains at least one digit. */
  testPromptContainsNumber: boolean;
  /** Expected next character for `next` mode; ignored otherwise. */
  nextHighlightChar: string | null;
  /** Active flashes for `react` mode (multiple can overlap); ignored otherwise. */
  reactFlashes: readonly KeymapReactFlash[];
  legendStyle: LegendStyle;
  keymapSize: number;
  isCapsLockOn: boolean;
  isShiftPressed: boolean;
  /** Show the touch-typing hands overlay (only enabled by parent for QWERTY + `next`). */
  showHandsOverlay?: boolean;
  className?: string;
};

export function TypingGameLayoutKeyboard({
  layout,
  showTopRowSetting,
  keymapDisplay,
  testPromptContainsNumber,
  nextHighlightChar,
  reactFlashes,
  legendStyle,
  keymapSize,
  isCapsLockOn,
  isShiftPressed,
  showHandsOverlay = false,
  className,
}: Props) {
  const layoutType = layout.type === "iso" ? "iso" : "ansi";
  const wantTop = computeKeymapTopRowVisible({
    keymapDisplay,
    showTopRow: showTopRowSetting,
    layoutKeymapShowTopRow: layout.keymapShowTopRow,
    testPromptContainsNumber,
  });
  const trimmed = trimForDisplay(layout);
  const hasVisibleRow1 = trimmed.row1.length > 0;
  const showNumberRow = wantTop && hasVisibleRow1;
  const rows = buildRows(layout, showNumberRow);

  return (
    <div
      className={cn("mx-auto mt-3 w-full overflow-x-auto overflow-y-visible py-1", className)}
      style={{
        transform: `scale(${keymapSize})`,
        transformOrigin: "top center",
      }}
    >
      <div className="mx-auto w-fit scale-75 sm:scale-90 md:scale-100">
        <div className="relative">
          <div className="flex flex-col gap-2.5 px-1 py-1">
            {rows.map((row) => (
              <LayoutKeyRow
                key={row.physicalRow}
                row={row}
                layoutType={layoutType}
                legendStyle={legendStyle}
                isCapsLockOn={isCapsLockOn}
                isShiftPressed={isShiftPressed}
                keymapDisplay={keymapDisplay}
                nextHighlightChar={nextHighlightChar}
                reactFlashes={reactFlashes}
              />
            ))}
          </div>
          {showHandsOverlay && keymapDisplay === "next" && (
            <TypingGameHandsOverlay
              activeChar={nextHighlightChar}
              showNumberRow={showNumberRow}
            />
          )}
        </div>
      </div>
    </div>
  );
}
