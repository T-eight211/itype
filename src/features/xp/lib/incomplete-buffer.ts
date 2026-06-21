"use client";

import {
  INCOMPLETE_BUFFER_MAX_ENTRIES,
  INCOMPLETE_MIN_SECONDS,
  LOCAL_INCOMPLETE_BUFFER_KEY,
} from "./xp-constants";
import type { IncompleteRun } from "./compute-xp";

function readRaw(): IncompleteRun[] {
  // This runs only in the browser. localStorage does not exist during server
  // rendering, so the server-safe fallback is an empty array.
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_INCOMPLETE_BUFFER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate parsed JSON before trusting it. This keeps malformed localStorage
    // data from entering the XP calculation.
    return parsed
      .filter((entry): entry is IncompleteRun => {
        return (
          entry != null &&
          typeof entry === "object" &&
          typeof (entry as IncompleteRun).seconds === "number" &&
          typeof (entry as IncompleteRun).accuracy === "number" &&
          Number.isFinite((entry as IncompleteRun).seconds) &&
          Number.isFinite((entry as IncompleteRun).accuracy)
        );
      })
      .slice(-INCOMPLETE_BUFFER_MAX_ENTRIES);
  } catch {
    return [];
  }
}

function writeRaw(runs: IncompleteRun[]) {
  // Persist the latest bounded list back to localStorage.
  if (typeof window === "undefined") return;
  try {
    const bounded = runs.slice(-INCOMPLETE_BUFFER_MAX_ENTRIES);
    window.localStorage.setItem(
      LOCAL_INCOMPLETE_BUFFER_KEY,
      JSON.stringify(bounded)
    );
  } catch {
    // Ignore localStorage failures, for example private browsing or full quota.
  }
}

export function appendIncompleteRun(run: IncompleteRun): void {
  // Store a short abandoned run so the next completed run can award a small
  // amount of XP for partial effort.
  if (typeof window === "undefined") return;
  if (!Number.isFinite(run.seconds) || !Number.isFinite(run.accuracy)) return;
  if (run.seconds < INCOMPLETE_MIN_SECONDS) return;

  const next: IncompleteRun = {
    // Round seconds and clamp accuracy to a normal 0-100 range.
    seconds: Math.max(0, Math.round(run.seconds)),
    accuracy: Math.min(100, Math.max(0, run.accuracy)),
  };
  const existing = readRaw();
  writeRaw([...existing, next]);
}

export function peekIncompleteRuns(): IncompleteRun[] {
  // Read without clearing, useful when the caller only needs to inspect values.
  return readRaw();
}

export function takeAllIncompleteRuns(): IncompleteRun[] {
  // Read and clear the buffer. This prevents the same incomplete runs being
  // counted more than once.
  const runs = readRaw();
  writeRaw([]);
  return runs;
}
