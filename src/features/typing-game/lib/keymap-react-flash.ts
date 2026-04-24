/** One active “react” keymap flash (multiple can overlap while typing fast). */
export type KeymapReactFlash = {
  id: number;
  ch: string;
  /** Whether the keypress that produced this flash matched the expected prompt char. */
  kind: "correct" | "incorrect";
};
