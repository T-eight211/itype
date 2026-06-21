import type { KeymapDisplay, ShowTopRow } from "@/features/settings/lib/user-settings";

export function computeKeymapTopRowVisible({
  keymapDisplay,
  showTopRow,
  layoutKeymapShowTopRow,
  testPromptContainsNumber,
}: {
  keymapDisplay: KeymapDisplay;
  showTopRow: ShowTopRow;
  layoutKeymapShowTopRow: boolean;
  testPromptContainsNumber: boolean;
}): boolean {
  // The number row is shown automatically for next-key practice with numbers,
  // always shown if the user chooses "always", or shown by layout default unless
  // the user explicitly disables it.
  return (
    (testPromptContainsNumber && keymapDisplay === "next") ||
    showTopRow === "always" ||
    (layoutKeymapShowTopRow && showTopRow !== "never")
  );
}
