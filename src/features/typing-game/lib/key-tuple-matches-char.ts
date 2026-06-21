import type { KeyTuple } from "@/features/typing-game/lib/keyboard-layout-types";

export function keyTupleMatchesChar(tuple: KeyTuple, ch: string | null | undefined): boolean {
  // Used by the keymap highlight logic to decide whether a physical key can
  // produce the requested character.
  if (ch == null || ch === "") return false;
  if (ch === " ") return tuple.some((s) => s === " ");

  for (const slot of tuple) {
    if (slot == null || slot === "") continue;
    if (slot === ch) return true;
    // Letters match case-insensitively because the same key produces uppercase
    // and lowercase letters depending on Shift/Caps Lock.
    if (slot.length === 1 && ch.length === 1 && /[a-zA-Z]/.test(slot) && /[a-zA-Z]/.test(ch)) {
      if (slot.toLowerCase() === ch.toLowerCase()) return true;
    }
  }
  return false;
}
