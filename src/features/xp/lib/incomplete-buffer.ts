"use client";

import {
  INCOMPLETE_BUFFER_MAX_ENTRIES,
  INCOMPLETE_MIN_SECONDS,
  LOCAL_INCOMPLETE_BUFFER_KEY,
} from "./xp-constants";
import type { IncompleteRun } from "./compute-xp";

function readRaw(): IncompleteRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_INCOMPLETE_BUFFER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
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
  if (typeof window === "undefined") return;
  try {
    const bounded = runs.slice(-INCOMPLETE_BUFFER_MAX_ENTRIES);
    window.localStorage.setItem(
      LOCAL_INCOMPLETE_BUFFER_KEY,
      JSON.stringify(bounded)
    );
  } catch {
  }
}

export function appendIncompleteRun(run: IncompleteRun): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(run.seconds) || !Number.isFinite(run.accuracy)) return;
  if (run.seconds < INCOMPLETE_MIN_SECONDS) return;

  const next: IncompleteRun = {
    seconds: Math.max(0, Math.round(run.seconds)),
    accuracy: Math.min(100, Math.max(0, run.accuracy)),
  };
  const existing = readRaw();
  writeRaw([...existing, next]);
}

export function peekIncompleteRuns(): IncompleteRun[] {
  return readRaw();
}

export function takeAllIncompleteRuns(): IncompleteRun[] {
  const runs = readRaw();
  writeRaw([]);
  return runs;
}
