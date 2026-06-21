"use client";

import type { AwardXpSuccess } from "../server/award-xp-for-typing-result";

const XP_AWARDED_EVENT = "itype:xp-awarded";

// CustomEvent carries the full XP award object through the browser event system.
type XpAwardedCustomEvent = CustomEvent<AwardXpSuccess>;

export function emitXpAwarded(award: AwardXpSuccess): void {
  // Dispatch a browser event so components outside the typing hook can react to
  // newly awarded XP without prop-drilling.
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(XP_AWARDED_EVENT, { detail: award }));
}

export function subscribeXpAwarded(
  callback: (award: AwardXpSuccess) => void
): () => void {
  // Subscribe to the browser event and return a cleanup function for useEffect.
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    callback((event as XpAwardedCustomEvent).detail);
  };
  window.addEventListener(XP_AWARDED_EVENT, handler as EventListener);
  return () => window.removeEventListener(XP_AWARDED_EVENT, handler as EventListener);
}
