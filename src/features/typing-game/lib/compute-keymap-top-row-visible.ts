import type { KeymapDisplay, ShowTopRow } from "@/features/settings/lib/user-settings";

/**
 * Whether the keymap’s number / top row should render.
 *
 * Mirrors the usual monkeytype-style rules:
 * - Show if the current prompt contains a digit and keymap mode is `next`.
 * - Or if the user chose “always”.
 * - Or if the layout JSON wants the top row (`keymapShowTopRow: true`) and the user did not choose “never”.
 */
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
