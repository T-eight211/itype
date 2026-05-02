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
  return (
    (testPromptContainsNumber && keymapDisplay === "next") ||
    showTopRow === "always" ||
    (layoutKeymapShowTopRow && showTopRow !== "never")
  );
}
