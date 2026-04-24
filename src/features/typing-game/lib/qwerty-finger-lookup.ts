import qwertyGeometry from "@/data/keyboard-layouts/geometry/qwerty.json";

export type Hand = "left" | "right" | "both";
export type Finger = "pinky" | "ring" | "middle" | "index" | "thumb";

export type QwertyFingerInfo = {
  hand: Hand;
  finger: Finger;
  /** Geometry x of the target key (in key-step units; one unit = 58px on screen). */
  x: number;
  /** Geometry y of the target key (-1 number, 0 top, 1 home, 2 bottom, 3 space). */
  y: number;
};

type RawKey = {
  key: string;
  shift: string;
  x: number;
  y: number;
  row: string;
  hand: string;
  finger: string;
};

let cachedMap: Map<string, QwertyFingerInfo> | null = null;

function buildMap(): Map<string, QwertyFingerInfo> {
  const map = new Map<string, QwertyFingerInfo>();
  const rows = qwertyGeometry.keys as Record<string, RawKey[]>;
  for (const rowKeys of Object.values(rows)) {
    for (const k of rowKeys) {
      const info: QwertyFingerInfo = {
        hand: k.hand as Hand,
        finger: k.finger as Finger,
        x: k.x,
        y: k.y,
      };
      if (k.key) map.set(k.key, info);
      if (k.shift && k.shift !== k.key) map.set(k.shift, info);
    }
  }
  return map;
}

function getMap(): Map<string, QwertyFingerInfo> {
  if (!cachedMap) cachedMap = buildMap();
  return cachedMap;
}

/**
 * Look up which hand+finger should press the given character on a US QWERTY keyboard.
 * Falls through shifted variants and case before giving up. Returns null for chars
 * outside the standard letter/number/symbol set (e.g. control chars).
 */
export function lookupQwertyFinger(ch: string | null | undefined): QwertyFingerInfo | null {
  if (ch == null || ch === "") return null;
  const map = getMap();
  const direct = map.get(ch);
  if (direct) return direct;
  if (ch.length === 1 && /[A-Za-z]/.test(ch)) {
    const swapped = ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
    const alt = map.get(swapped);
    if (alt) return alt;
  }
  return null;
}
