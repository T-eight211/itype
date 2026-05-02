export type KeyboardLayoutKind = "ansi" | "iso";

export type KeyTuple = string[];

export type KeyboardLayoutData = {
  keymapShowTopRow: boolean;
  type: KeyboardLayoutKind;
  keys: {
    row1: KeyTuple[];
    row2: KeyTuple[];
    row3: KeyTuple[];
    row4: KeyTuple[];
    row5: KeyTuple[];
  };
};

export function isKeyboardLayoutData(value: unknown): value is KeyboardLayoutData {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (o.type !== "ansi" && o.type !== "iso") return false;
  if (typeof o.keymapShowTopRow !== "boolean") return false;
  if (!o.keys || typeof o.keys !== "object") return false;
  const k = o.keys as Record<string, unknown>;
  for (const row of ["row1", "row2", "row3", "row4", "row5"] as const) {
    if (!Array.isArray(k[row])) return false;
  }
  return true;
}
