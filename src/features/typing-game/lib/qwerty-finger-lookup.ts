import qwertyGeometry from "@/data/keyboard-layouts/geometry/qwerty.json";

export type Hand = "left" | "right" | "both";
export type Finger = "pinky" | "ring" | "middle" | "index" | "thumb";

export type QwertyFingerInfo = {
  hand: Hand;
  finger: Finger;

  // x/y are keyboard-grid coordinates, not screen pixels.
  x: number;
 
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
  // Build a lookup table from the keyboard geometry JSON. This lets the UI find
  // the correct hand/finger for the next expected character quickly.
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
      // Shifted characters use the same hand and finger as the base key.
      if (k.shift && k.shift !== k.key) map.set(k.shift, info);
    }
  }
  return map;
}

function getMap(): Map<string, QwertyFingerInfo> {
  // Cache the map after the first build so repeated lookups are cheap.
  if (!cachedMap) cachedMap = buildMap();
  return cachedMap;
}


export function lookupQwertyFinger(ch: string | null | undefined): QwertyFingerInfo | null {
  if (ch == null || ch === "") return null;
  const map = getMap();
  const direct = map.get(ch);
  if (direct) return direct;
  if (ch.length === 1 && /[A-Za-z]/.test(ch)) {
    // Uppercase and lowercase letters share the same physical key.
    const swapped = ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
    const alt = map.get(swapped);
    if (alt) return alt;
  }
  return null;
}
