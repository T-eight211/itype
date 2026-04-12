export type AlignmentCell =
  | { type: "prompt"; index: number; inputIndex: number | null; status: "correct" | "wrong" | "skipped" }
  | { type: "extra"; inputIndex: number; char: string };

export type AlignmentResult = {
  cells: AlignmentCell[];
  promptCursor: number;
  inputCursor: number;
  cursorCellIndex: number;
};

export function computeAlignment(prompt: string, input: string): AlignmentResult {
  const cells: AlignmentCell[] = [];
  let pi = 0;
  let ii = 0;
  let cursorCellIndex = -1;

  while (ii < input.length) {
    const c = input[ii];
    const expected = pi < prompt.length ? prompt[pi] : null;

    if (expected !== null && c === expected) {
      cells.push({ type: "prompt", index: pi, inputIndex: ii, status: "correct" });
      pi++;
      ii++;
      cursorCellIndex = cells.length - 1;
    } else if (expected !== null && expected !== " " && c === " ") {
      while (pi < prompt.length && prompt[pi] !== " ") {
        cells.push({ type: "prompt", index: pi, inputIndex: null, status: "skipped" });
        pi++;
      }
      if (pi < prompt.length && prompt[pi] === " ") {
        cells.push({ type: "prompt", index: pi, inputIndex: ii, status: "correct" });
        pi++;
      } else {
        cells.push({ type: "extra", inputIndex: ii, char: c });
      }
      ii++;
      cursorCellIndex = cells.length - 1;
    } else if (expected === null || expected === " ") {
      cells.push({ type: "extra", inputIndex: ii, char: c });
      ii++;
      cursorCellIndex = cells.length - 1;
    } else {
      cells.push({ type: "prompt", index: pi, inputIndex: ii, status: "wrong" });
      pi++;
      ii++;
      cursorCellIndex = cells.length - 1;
    }
  }

  const promptCursorConsumed = pi;

  while (pi < prompt.length) {
    cells.push({ type: "prompt", index: pi, inputIndex: null, status: "skipped" });
    pi++;
  }

  return { cells, promptCursor: promptCursorConsumed, inputCursor: input.length, cursorCellIndex };
}

/** Extra cells only for the segment after the last typed space (current input “word”). */
export function countExtrasInActiveInputWord(
  alignment: AlignmentResult,
  rawInput: string
): number {
  const wordStart = rawInput.lastIndexOf(" ") + 1;
  let n = 0;
  for (const cell of alignment.cells) {
    if (cell.type === "extra" && cell.inputIndex >= wordStart) n++;
  }
  return n;
}

export function computeCheckpointInputIndex(
  alignment: AlignmentResult,
  displayText: string,
  rawInput: string
): number {
  const promptCellByIndex = new Map<number, AlignmentCell>();
  const extraInputIndices = new Set<number>();
  const inputSpaceToPromptIndex = new Map<number, number>();

  alignment.cells.forEach((cell) => {
    if (cell.type === "prompt") {
      if (!promptCellByIndex.has(cell.index)) {
        promptCellByIndex.set(cell.index, cell);
      }
      if (displayText[cell.index] === " " && cell.status === "correct" && cell.inputIndex != null) {
        inputSpaceToPromptIndex.set(cell.inputIndex, cell.index);
      }
    } else {
      extraInputIndices.add(cell.inputIndex);
    }
  });

  let checkpoint = 0;

  for (let inputIdx = 0; inputIdx < rawInput.length; inputIdx++) {
    if (rawInput[inputIdx] !== " ") continue;

    const promptSpaceIdx = inputSpaceToPromptIndex.get(inputIdx);
    if (promptSpaceIdx == null) continue;

    let wordStart = promptSpaceIdx - 1;
    while (wordStart >= 0 && displayText[wordStart] !== " ") {
      wordStart--;
    }
    wordStart++;
    const wordEnd = promptSpaceIdx;

    let ok = true;
    let minIn = Infinity;
    let maxIn = -1;

    for (let j = wordStart; j < wordEnd; j++) {
      const cell = promptCellByIndex.get(j);
      if (!cell || cell.type !== "prompt" || cell.status !== "correct" || cell.inputIndex == null) {
        ok = false;
        break;
      }
      minIn = Math.min(minIn, cell.inputIndex);
      maxIn = Math.max(maxIn, cell.inputIndex);
    }

    if (!ok) continue;

    for (const ei of extraInputIndices) {
      if (ei >= minIn && ei <= maxIn) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    for (const ei of extraInputIndices) {
      if (ei > maxIn && ei < inputIdx) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    checkpoint = Math.max(checkpoint, inputIdx + 1);
  }

  return checkpoint;
}

export function isLastWordFullyCorrect(alignment: AlignmentResult, displayText: string): boolean {
  if (displayText.length === 0 || alignment.promptCursor < displayText.length) return false;

  const lastSpace = displayText.lastIndexOf(" ");
  const lastWordStart = lastSpace === -1 ? 0 : lastSpace + 1;
  const lastWordEnd = displayText.length;

  const promptCellByIndex = new Map<number, AlignmentCell>();
  const extraInputIndices = new Set<number>();

  alignment.cells.forEach((cell) => {
    if (cell.type === "prompt") promptCellByIndex.set(cell.index, cell);
    else extraInputIndices.add(cell.inputIndex);
  });

  let minIn = Infinity;
  let maxIn = -1;

  for (let j = lastWordStart; j < lastWordEnd; j++) {
    const cell = promptCellByIndex.get(j);
    if (!cell || cell.type !== "prompt" || cell.status !== "correct" || cell.inputIndex == null) {
      return false;
    }
    minIn = Math.min(minIn, cell.inputIndex);
    maxIn = Math.max(maxIn, cell.inputIndex);
  }

  for (const ei of extraInputIndices) {
    if (ei >= minIn && ei <= maxIn) return false;
  }

  return true;
}

export function computeCorrectCharsForWpm(
  alignment: AlignmentResult,
  displayText: string
): number {
  if (!displayText) return 0;

  const promptCellByIndex = new Map<number, AlignmentCell>();
  const extraInputIndices = new Set<number>();

  alignment.cells.forEach((cell) => {
    if (cell.type === "prompt") {
      if (!promptCellByIndex.has(cell.index)) {
        promptCellByIndex.set(cell.index, cell);
      }
    } else {
      extraInputIndices.add(cell.inputIndex);
    }
  });

  let total = 0;
  const n = displayText.length;
  let i = 0;

  while (i < n) {
    if (displayText[i] === " ") {
      i++;
      continue;
    }

    const start = i;
    while (i < n && displayText[i] !== " ") i++;
    const end = i;

    let ok = true;
    let minIn = Infinity;
    let maxIn = -1;

    for (let j = start; j < end; j++) {
      const cell = promptCellByIndex.get(j);
      if (!cell || cell.type !== "prompt" || cell.status !== "correct" || cell.inputIndex == null) {
        ok = false;
        break;
      }
      minIn = Math.min(minIn, cell.inputIndex);
      maxIn = Math.max(maxIn, cell.inputIndex);
    }

    if (!ok) continue;

    for (const ei of extraInputIndices) {
      if (ei >= minIn && ei <= maxIn) {
        ok = false;
        break;
      }
    }

    if (!ok) continue;

    total += end - start;

    const spaceIdx = end;
    const spaceCell = promptCellByIndex.get(spaceIdx);
    if (
      spaceCell &&
      spaceCell.type === "prompt" &&
      displayText[spaceIdx] === " " &&
      spaceCell.status === "correct" &&
      spaceCell.inputIndex != null
    ) {
      total += 1;
    }
  }

  return total;
}


