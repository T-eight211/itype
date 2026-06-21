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

// Adds left padding to each physical keyboard row so the visual keymap looks
// like a staggered real keyboard.
function rowPlClass(physicalRow: 1 | 2 | 3 | 4 | 5, layoutType: "ansi" | "iso") {
  if (physicalRow === 1) return "";
  if (physicalRow === 2) return "pl-[28px]";
  if (physicalRow === 3) return "pl-[48px]";
  if (physicalRow === 4) return layoutType === "iso" ? "pl-[28px]" : "pl-[76px]";
  if (physicalRow === 5) return "pl-[192px]";
  return "";
}

// Removes keys that are not useful for the compact typing-game display, such as
// escape/backspace style keys from imported layout files.
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

// Decides which character label appears on each key. Dynamic mode changes the
// label when Shift or Caps Lock is active.
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
      if (a.length === 1 && /[a-zA-Z]/.test(a)) {
        const useShiftedLayer = isCapsLockOn !== isShiftPressed;
        return useShiftedLayer ? shiftedFromLayout : a;
      }
      return isShiftPressed ? shiftedFromLayout : a;
    }
    default:
      return a;
  }
}

type RowEntry = { physicalRow: 1 | 2 | 3 | 4 | 5; keys: KeyTuple[] };

// Builds the list of visible rows, optionally hiding the number row.
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

// Chooses how a key should be highlighted. "next" mode highlights the expected
// next key; "react" mode briefly flashes the key the user actually pressed.
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
    return matching.some((f) => f.kind === "incorrect") ? "incorrect" : "correct";
  }
  return null;
}

// Converts the logical highlight into the colour names expected by the shared
// animated keyboard component.
function highlightToKeylightColor(h: KeycapHighlight): "default" | "rgb" | "green" | "red" {
  if (h === "rgb") return "rgb";
  if (h === "correct") return "green";
  if (h === "incorrect") return "red";
  return "default";
}

// Renders one physical row of keycaps.
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
        // Each key gets a stable React key from its row, position and base
        // character so React can update highlights without remounting every key.
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
  showTopRowSetting: ShowTopRow;
  keymapDisplay: KeymapDisplay;
  testPromptContainsNumber: boolean;
  nextHighlightChar: string | null;
  reactFlashes: readonly KeymapReactFlash[];
  legendStyle: LegendStyle;
  keymapSize: number;
  isCapsLockOn: boolean;
  isShiftPressed: boolean;
  showHandsOverlay?: boolean;
  className?: string;
};

// Visual keyboard shown under the typing prompt. It is controlled by user
// settings and can show the next expected key, typed-key flashes, labels and an
// optional hands overlay.
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
  // Decide whether the top number row should appear based on settings, layout
  // metadata and whether the current prompt contains numbers.
  const wantTop = computeKeymapTopRowVisible({
    keymapDisplay,
    showTopRow: showTopRowSetting,
    layoutKeymapShowTopRow: layout.keymapShowTopRow,
    testPromptContainsNumber,
  });
  const trimmed = trimForDisplay(layout);
  const hasVisibleRow1 = trimmed.row1.length > 0;
  const showNumberRow = wantTop && hasVisibleRow1;
  // Convert the stored keyboard layout object into rows that can be rendered
  // as repeated KeyRow/Keycap components.
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
            {/* Render each physical keyboard row from the layout data. */}
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
          {/* The hands overlay is only useful in "next key" mode because it
              points to the finger for the next expected character. */}
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
