// A single item in the visual typing display. A prompt cell represents a
// character from the target text. An extra cell represents a character the user
// typed that does not belong to the target text.
export type AlignmentCell =
  | { type: "prompt"; index: number; inputIndex: number | null; status: "correct" | "wrong" | "skipped" }
  | { type: "extra"; inputIndex: number; char: string };

// The full comparison result between the target text and what the user typed.
// This is an object shape used by React components and metric helpers.
export type AlignmentResult = {
  cells: AlignmentCell[];
  promptCursor: number;
  inputCursor: number;
  cursorCellIndex: number;
};

// Compares the target text (`prompt`) with the typed text (`input`). It builds
// character-level cells that the UI can colour as correct, wrong, skipped or
// extra. This is more flexible than a simple index check because early spaces
// and extra characters move the prompt and input cursors differently.
export function computeAlignment(prompt: string, input: string): AlignmentResult {
  // This array is filled from left to right. The visible typing component later
  // loops through this array to render every character.
  const cells: AlignmentCell[] = [];
  // `pi` tracks the current target-text character. `ii` tracks the current typed
  // character. They are separate so skipped and extra characters can be handled.
  let pi = 0;
  let ii = 0;
  // This stores the index inside `cells` where the cursor should appear. It is
  // updated every time a typed character is processed.
  let cursorCellIndex = -1;

  // Keep processing while there are still typed characters in raw input.
  while (ii < input.length) {
    // `c` is the current character the user typed.
    const c = input[ii];
    // `expected` is the current target character. If the target prompt has
    // already ended, expected becomes null and any further input is extra.
    const expected = pi < prompt.length ? prompt[pi] : null;

    // Correct character: both the prompt cursor and input cursor move forward.
    if (expected !== null && c === expected) {
      // Store a prompt cell because this character belongs to the target text.
      // `index` points to prompt[pi], and `inputIndex` points to input[ii].
      cells.push({ type: "prompt", index: pi, inputIndex: ii, status: "correct" });
      // Move to the next target character.
      pi++;
      // Move to the next typed character.
      ii++;
      // The cursor should now be after this newly added cell.
      cursorCellIndex = cells.length - 1;
    } else if (expected !== null && expected !== " " && c === " ") {
      // Early space: the user ended the word before typing all target letters.
      // Missing target letters are marked as skipped until the next target space.
      while (pi < prompt.length && prompt[pi] !== " ") {
        // The user did not type this target letter, so there is no inputIndex.
        cells.push({ type: "prompt", index: pi, inputIndex: null, status: "skipped" });
        // Continue skipping target letters until the target word boundary.
        pi++;
      }
      if (pi < prompt.length && prompt[pi] === " ") {
        // The typed space is accepted as the target space after the skipped word.
        cells.push({ type: "prompt", index: pi, inputIndex: ii, status: "correct" });
        // Move past the target space.
        pi++;
      } else {
        // If there was no target space left, the typed space is just extra input.
        cells.push({ type: "extra", inputIndex: ii, char: c });
      }
      // The typed space has now been consumed.
      ii++;
      cursorCellIndex = cells.length - 1;
    } else if (expected === null || expected === " ") {
      // Extra character: the user typed something when the target is already at
      // a word boundary or finished. Only the input cursor moves forward.
      // This cell has no prompt index because it does not exist in displayText.
      cells.push({ type: "extra", inputIndex: ii, char: c });
      // Only move through the user's input. The target cursor stays on the space
      // or remains past the end.
      ii++;
      cursorCellIndex = cells.length - 1;
    } else {
      // Wrong character: the typed character is aligned to the current target
      // character, but marked wrong. Both cursors move forward.
      // This keeps the typed character attached to the target position where the
      // mistake happened.
      cells.push({ type: "prompt", index: pi, inputIndex: ii, status: "wrong" });
      // Move both cursors because the wrong typed character has still occupied
      // this target position.
      pi++;
      ii++;
      cursorCellIndex = cells.length - 1;
    }
  }

  // At this point all typed input has been processed. Save where the prompt
  // cursor got to before adding visual-only remaining prompt characters.
  const promptCursorConsumed = pi;

  // Add the remaining target characters as skipped/untyped cells so the visual
  // renderer can still show the full prompt.
  while (pi < prompt.length) {
    // These remaining characters have not been typed, so inputIndex is null.
    cells.push({ type: "prompt", index: pi, inputIndex: null, status: "skipped" });
    pi++;
  }

  // Return one object containing the full cell list and cursor positions.
  return { cells, promptCursor: promptCursorConsumed, inputCursor: input.length, cursorCellIndex };
}

// Counts extra typed characters in the current active word. This is used to stop
// a user from adding an unlimited number of extra characters in one word.
export function countExtrasInActiveInputWord(
  alignment: AlignmentResult,
  rawInput: string
): number {
  // The current active word starts after the last typed space.
  const wordStart = rawInput.lastIndexOf(" ") + 1;
  let n = 0;
  // Count only extra cells whose typed index is inside the current word.
  for (const cell of alignment.cells) {
    if (cell.type === "extra" && cell.inputIndex >= wordStart) n++;
  }
  return n;
}

// Finds the earliest input index the user is not allowed to backspace past. Once
// a word has been completed correctly and followed by a space, this checkpoint
// prevents deleting back into already accepted words.
export function computeCheckpointInputIndex(
  alignment: AlignmentResult,
  displayText: string,
  rawInput: string
): number {
  // Map target-text indexes to their prompt cells. Example: target index 4 maps
  // to the cell for displayText[4].
  const promptCellByIndex = new Map<number, AlignmentCell>();
  // Set of rawInput indexes where extra typed characters happened.
  const extraInputIndices = new Set<number>();
  // Map typed spaces back to target spaces. Example: rawInput[8] space matched
  // displayText[7] space, so the map stores 8 -> 7.
  const inputSpaceToPromptIndex = new Map<number, number>();

  // First pass over the alignment cells builds lookup structures used below.
  alignment.cells.forEach((cell) => {
    if (cell.type === "prompt") {
      // Store the first prompt cell for each target index.
      if (!promptCellByIndex.has(cell.index)) {
        promptCellByIndex.set(cell.index, cell);
      }
      // If this prompt cell is a correctly typed space, remember which typed
      // space index matched which target space index.
      if (displayText[cell.index] === " " && cell.status === "correct" && cell.inputIndex != null) {
        inputSpaceToPromptIndex.set(cell.inputIndex, cell.index);
      }
    } else {
      // Extra cells are stored by the index where they appeared in rawInput.
      extraInputIndices.add(cell.inputIndex);
    }
  });

  // 0 means no word has been locked yet, so backspace can go to the beginning.
  let checkpoint = 0;

  // Walk through raw input and check every typed space. A typed space means the
  // user may have completed the word before it.
  for (let inputIdx = 0; inputIdx < rawInput.length; inputIdx++) {
    // Ignore letters and only process spaces.
    if (rawInput[inputIdx] !== " ") continue;

    // Find the target-space index that this typed space matched.
    const promptSpaceIdx = inputSpaceToPromptIndex.get(inputIdx);
    // If this typed space did not match a target space, it cannot complete a word.
    if (promptSpaceIdx == null) continue;

    // Start from the character before the matched target space and move backward
    // until the previous target space. This finds the target word before it.
    let wordStart = promptSpaceIdx - 1;
    while (wordStart >= 0 && displayText[wordStart] !== " ") {
      wordStart--;
    }
    // Move one step forward from the previous space to the first letter.
    wordStart++;
    // The word ends at the matched target space. The space itself is not part of
    // the word letter range.
    const wordEnd = promptSpaceIdx;

    // `ok` stays true only if the word is fully correct and has no extras.
    let ok = true;
    // `minIn` and `maxIn` become the rawInput range occupied by this word's
    // correctly typed target letters.
    let minIn = Infinity;
    let maxIn = -1;

    // Check every target character in the word.
    for (let j = wordStart; j < wordEnd; j++) {
      // Get the alignment cell for displayText[j].
      const cell = promptCellByIndex.get(j);
      // Every target letter must exist, be a prompt cell, be correct, and have a
      // matching input index. Wrong/skipped/untyped letters fail this word.
      if (!cell || cell.type !== "prompt" || cell.status !== "correct" || cell.inputIndex == null) {
        ok = false;
        break;
      }
      // Track where this correct word starts and ends in rawInput.
      minIn = Math.min(minIn, cell.inputIndex);
      maxIn = Math.max(maxIn, cell.inputIndex);
    }

    // If any target letter failed, do not lock this word.
    if (!ok) continue;

    // Reject the word if an extra character sits between the first and last
    // correct input character for that word, such as "txwo".
    for (const ei of extraInputIndices) {
      if (ei >= minIn && ei <= maxIn) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    // Reject the word if an extra character was typed after the last correct
    // letter but before the finishing space, such as "twoe ".
    for (const ei of extraInputIndices) {
      if (ei > maxIn && ei < inputIdx) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    // The word before this space is fully correct, so move the checkpoint to the
    // character after the space. Backspace cannot go before this point.
    checkpoint = Math.max(checkpoint, inputIdx + 1);
  }

  // Return the furthest safe checkpoint found across all typed spaces.
  return checkpoint;
}

// Checks whether the final word is fully correct. This matters because the last
// word has no trailing space, so the game needs a separate completion check.
export function isLastWordFullyCorrect(alignment: AlignmentResult, displayText: string): boolean {
  // The last word can only be fully correct if the prompt cursor reached the end
  // of the target text.
  if (displayText.length === 0 || alignment.promptCursor < displayText.length) return false;

  // Find the start/end target indexes for the final word.
  const lastSpace = displayText.lastIndexOf(" ");
  const lastWordStart = lastSpace === -1 ? 0 : lastSpace + 1;
  const lastWordEnd = displayText.length;

  // Build quick lookups for target cells and extra typed characters.
  const promptCellByIndex = new Map<number, AlignmentCell>();
  const extraInputIndices = new Set<number>();

  alignment.cells.forEach((cell) => {
    // Prompt cells are accessed by target index.
    if (cell.type === "prompt") promptCellByIndex.set(cell.index, cell);
    // Extra cells are accessed by typed input index.
    else extraInputIndices.add(cell.inputIndex);
  });

  // These track where the final word's correct letters sit in rawInput.
  let minIn = Infinity;
  let maxIn = -1;

  // Every character in the final target word must be correct.
  for (let j = lastWordStart; j < lastWordEnd; j++) {
    const cell = promptCellByIndex.get(j);
    if (!cell || cell.type !== "prompt" || cell.status !== "correct" || cell.inputIndex == null) {
      return false;
    }
    minIn = Math.min(minIn, cell.inputIndex);
    maxIn = Math.max(maxIn, cell.inputIndex);
  }

  // Extra characters inside the final word's input range mean the final word is
  // not fully correct.
  for (const ei of extraInputIndices) {
    if (ei >= minIn && ei <= maxIn) return false;
  }

  return true;
}

// Counts only fully correct words for WPM. A word with any wrong or extra
// character is not counted as correct until it is fixed.
export function computeCorrectCharsForWpm(
  alignment: AlignmentResult,
  displayText: string
): number {
  if (!displayText) return 0;

  // Build lookup structures from the alignment result.
  const promptCellByIndex = new Map<number, AlignmentCell>();
  const extraInputIndices = new Set<number>();

  alignment.cells.forEach((cell) => {
    if (cell.type === "prompt") {
      // Store the first cell for each target character index.
      if (!promptCellByIndex.has(cell.index)) {
        promptCellByIndex.set(cell.index, cell);
      }
    } else {
      // Store raw input positions for extra typed characters.
      extraInputIndices.add(cell.inputIndex);
    }
  });

  // `total` is the final number of correct characters counted for WPM.
  let total = 0;
  // `n` is the number of target characters.
  const n = displayText.length;
  // `i` walks through displayText word by word.
  let i = 0;

  while (i < n) {
    // Skip spaces until the start of the next word.
    if (displayText[i] === " ") {
      i++;
      continue;
    }

    // Mark the start index of this target word.
    const start = i;
    // Move `i` to the first space after the word, or to the end of displayText.
    while (i < n && displayText[i] !== " ") i++;
    // `end` is exclusive, so the word is displayText.slice(start, end).
    const end = i;

    // This word only contributes to WPM if all checks pass.
    let ok = true;
    // Track where this word's correct characters appear in rawInput.
    let minIn = Infinity;
    let maxIn = -1;

    // Check every target character in this word.
    for (let j = start; j < end; j++) {
      const cell = promptCellByIndex.get(j);
      // Any missing, wrong, skipped or untyped character means the word is not
      // counted for corrected WPM.
      if (!cell || cell.type !== "prompt" || cell.status !== "correct" || cell.inputIndex == null) {
        ok = false;
        break;
      }
      // Track the rawInput range covered by this correct word.
      minIn = Math.min(minIn, cell.inputIndex);
      maxIn = Math.max(maxIn, cell.inputIndex);
    }

    // Do not count this word if any target character failed.
    if (!ok) continue;

    // Extra characters inside the same input range invalidate the word for WPM.
    for (const ei of extraInputIndices) {
      if (ei >= minIn && ei <= maxIn) {
        ok = false;
        break;
      }
    }

    if (!ok) continue;

    // Add the number of letters in the correct word.
    total += end - start;

    // If the following target space was also typed correctly, count that space
    // as a correct character too.
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
