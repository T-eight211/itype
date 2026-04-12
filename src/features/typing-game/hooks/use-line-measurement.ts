import { useRef, useCallback, useLayoutEffect } from "react";

interface UseLineMeasurementParams {
  measureStr: string;
  cursorCellIndex: number;
  settingsKey: string;
}

export function useLineMeasurement({
  measureStr,
  cursorCellIndex,
  settingsKey,
}: UseLineMeasurementParams) {
  const measureRef = useRef<HTMLDivElement>(null);
  const wrapContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const previousCursorTopRef = useRef<number | null>(null);
  const previousCursorIndexRef = useRef<number>(-1);

  const runMeasure = useCallback(() => {
    const measureEl = measureRef.current;
    if (!measureEl || !measureStr) return null;
    const textNode = measureEl.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return null;
    const indices = new Set<number>();
    let lastTop = -1;
    const nodeLen = textNode.textContent?.length ?? 0;
    for (let i = 0; i < measureStr.length && i + 1 <= nodeLen; i++) {
      const range = document.createRange();
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (lastTop >= 0 && Math.round(rect.top) > Math.round(lastTop)) indices.add(i);
      lastTop = rect.top;
    }
    return indices;
  }, [measureStr]);

  // Line break detection + resize observer
  useLayoutEffect(() => {
    const containerEl = wrapContainerRef.current;
    if (!containerEl || !measureStr) return;
    runMeasure();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => { runMeasure(); });
    });
    ro.observe(containerEl);
    return () => ro.disconnect();
  }, [measureStr, runMeasure]);

  // Reset scroll position on settings change
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = 0;
    previousCursorTopRef.current = null;
    previousCursorIndexRef.current = -1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsKey]);

  // Auto-scroll to keep cursor visible
  useLayoutEffect(() => {
    const measureEl = measureRef.current;
    const scrollEl = scrollContainerRef.current;
    if (!measureEl || !scrollEl || !measureStr) return;
    const textNode = measureEl.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

    const nodeLen = textNode.textContent?.length ?? 0;
    const cursorMeasureIndex = cursorCellIndex < 0 ? 0 : cursorCellIndex;
    const safeIndex = Math.min(cursorMeasureIndex, measureStr.length - 1, nodeLen - 1);
    if (safeIndex < 0 || safeIndex + 1 > nodeLen) return;

    const range = document.createRange();
    range.setStart(textNode, safeIndex);
    range.setEnd(textNode, safeIndex + 1);
    const rect = range.getBoundingClientRect();
    const newCursorTop = rect.top;

    const threshold = 2;
    const lineHeight = scrollEl.offsetHeight / 3;
    const scrollRect = scrollEl.getBoundingClientRect();
    const cursorOnOrPastBottomLine =
      newCursorTop >= scrollRect.bottom - lineHeight - threshold;

    if (cursorMeasureIndex === 0) {
      previousCursorTopRef.current = newCursorTop;
      previousCursorIndexRef.current = 0;
      return;
    }

    const prevTop = previousCursorTopRef.current;
    const prevIndex = previousCursorIndexRef.current;
    const movedForward = cursorMeasureIndex > prevIndex;

    if (!movedForward) return;

    previousCursorTopRef.current = newCursorTop;
    previousCursorIndexRef.current = cursorMeasureIndex;

    const movedDown = prevTop !== null && newCursorTop > prevTop + threshold;

    if (movedDown && cursorOnOrPastBottomLine) {
      scrollEl.scrollTop = Math.min(
        scrollEl.scrollHeight - scrollEl.clientHeight,
        scrollEl.scrollTop + lineHeight
      );
    }
  }, [cursorCellIndex, measureStr]);

  return { measureRef, wrapContainerRef, scrollContainerRef };
}
