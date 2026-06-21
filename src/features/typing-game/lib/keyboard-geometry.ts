import qwertyLayout from "@/data/keyboard-layouts/geometry/qwerty.json";
import type { KeyPairDetail, KeyboardRow, Finger } from "../schemas/word-error-event";

type RawKey = {
  key: string;
  shift: string;
  x: number;
  y: number;
  row: string;
  hand: string;
  finger: string;
};

export type KeyInfo = {
  char: string;
  x: number;
  y: number;
  row: KeyboardRow;
  hand: string;
  finger: Finger;
};
4
// Cached map from a visible character to its physical QWERTY key metadata.
// A Map is used because lookups happen repeatedly during error classification.
const keyMap = new Map<string, KeyInfo>();

function toFinger(hand: string, finger: string): Finger {
  // Convert layout JSON values like "left" + "index" into the schema value
  // stored in error analytics, for example "left_index".
  if (finger === "thumb") return "thumb";
  return `${hand}_${finger}` as Finger;
}

function init() {
  // Lazily build the map once. This avoids rebuilding keyboard metadata every
  // time a typed character or error event needs key information.
  if (keyMap.size > 0) return;
  const rows = qwertyLayout.keys as Record<string, RawKey[]>;
  for (const rowKeys of Object.values(rows)) {
    for (const k of rowKeys) {
      const info: KeyInfo = {
        char: k.key,
        x: k.x,
        y: k.y,
        row: k.row as KeyboardRow,
        hand: k.hand,
        finger: toFinger(k.hand, k.finger),
      };
      keyMap.set(k.key, info);
      if (k.shift && k.shift !== k.key) {
        // Shifted symbols, such as "!" on the "1" key, share the same physical
        // key position and finger assignment.
        keyMap.set(k.shift, { ...info, char: k.shift });
      }
    }
  }
}

export function getKeyInfo(char: string): KeyInfo | null {
  init();
  // Lowercase fallback lets uppercase letters reuse the same physical key.
  return keyMap.get(char) ?? keyMap.get(char.toLowerCase()) ?? null;
}

export function computeKeyDistance(a: string, b: string): number {
  // Euclidean distance is used on keyboard-grid coordinates. This gives a
  // simple measurement of how far the actual key was from the expected key.
  const ka = getKeyInfo(a);
  const kb = getKeyInfo(b);
  if (!ka || !kb) return -1;
  return Math.round(Math.sqrt((ka.x - kb.x) ** 2 + (ka.y - kb.y) ** 2) * 100) / 100;
}

export function buildKeyPairDetail(expected: string, actual: string): KeyPairDetail {
  const eInfo = getKeyInfo(expected);
  const aInfo = getKeyInfo(actual);
  // Enrich a substitution with keyboard metadata so analytics can describe
  // row, finger, hand and nearby-key mistakes.
  const dist = eInfo && aInfo
    ? Math.round(Math.sqrt((eInfo.x - aInfo.x) ** 2 + (eInfo.y - aInfo.y) ** 2) * 100) / 100
    : 0;
  const sameHand = eInfo && aInfo ? eInfo.hand === aInfo.hand : false;
  const sameFinger = eInfo && aInfo ? eInfo.finger === aInfo.finger : false;

  return {
    expected,
    actual,
    keyboard_row_expected: eInfo?.row ?? "home",
    keyboard_row_actual: aInfo?.row ?? "home",
    finger_expected: eInfo?.finger ?? "left_index",
    finger_actual: aInfo?.finger ?? "left_index",
    key_distance: dist,
    // A small key distance is treated as a likely adjacent-key slip.
    adjacent_key_slip: dist > 0 && dist <= 1.0,
    same_hand: sameHand,
    same_finger: sameFinger,
  };
}

export function buildSubstitutionDetails(expected: string, actual: string) {
  // Substitution events only need the keyboard fields, so this helper extracts
  // the relevant part of the fuller key-pair detail.
  const pair = buildKeyPairDetail(expected, actual);
  return {
    keyboard_row_expected: pair.keyboard_row_expected,
    keyboard_row_actual: pair.keyboard_row_actual,
    finger_expected: pair.finger_expected,
    finger_actual: pair.finger_actual,
    key_distance: pair.key_distance,
    adjacent_key_slip: pair.adjacent_key_slip,
    same_hand: pair.same_hand,
    same_finger: pair.same_finger,
  };
}
