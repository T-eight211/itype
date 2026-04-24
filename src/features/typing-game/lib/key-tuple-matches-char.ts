import type { KeyTuple } from "@/features/typing-game/lib/keyboard-layout-types";

export function keyTupleMatchesChar(tuple: KeyTuple, ch: string | null | undefined): boolean {
  if (ch == null || ch === "") return false;
  if (ch === " ") return tuple.some((s) => s === " ");

  for (const slot of tuple) {
    if (slot == null || slot === "") continue;
    if (slot === ch) return true;
    if (slot.length === 1 && ch.length === 1 && /[a-zA-Z]/.test(slot) && /[a-zA-Z]/.test(ch)) {
      if (slot.toLowerCase() === ch.toLowerCase()) return true;
    }
  }
  return false;
}
