import { computeAlignment, type AlignmentResult, type AlignmentCell } from "./alignment";

export function getLastKeystrokeCorrectness(
  displayText: string,
  input: string
): "correct" | "incorrect" | null {
  if (!input.length) return null;

  // Reuse the alignment structure so skipped and extra characters are handled
  // the same way as the visual typing display.
  const alignment = computeAlignment(displayText, input);
  const lastInputIndex = input.length - 1;

  // Find the alignment cell that represents the most recent typed character.
  const cell = alignment.cells.find(
    (c) =>
      (c.type === "prompt" && c.inputIndex === lastInputIndex) ||
      (c.type === "extra" && c.inputIndex === lastInputIndex)
  );

  if (!cell) return null;

  if (cell.type === "extra") return "incorrect";
  if (cell.type === "prompt" && cell.status === "wrong") return "incorrect";
  if (cell.type === "prompt" && cell.status === "correct") {
    const char = displayText[cell.index];
    if (char === " ") {
      // A space only counts as correct if the word before it was fully correct.
      // This prevents early space presses from being counted as successful input.
      const wordBeforeClean = isWordBeforeSpaceFullyCorrect(
        alignment,
        displayText,
        cell.index,
        cell.inputIndex ?? lastInputIndex
      );
      return wordBeforeClean ? "correct" : "incorrect";
    }
    return "correct";
  }

  return null;
}

function isWordBeforeSpaceFullyCorrect(
  alignment: AlignmentResult,
  displayText: string,
  spacePromptIndex: number,
  spaceInputIndex: number
): boolean {
  // Locate the target word directly before the typed space.
  const wordStart =
    displayText.lastIndexOf(" ", spacePromptIndex - 1) + 1;
  const wordEnd = spacePromptIndex;
  if (wordStart >= wordEnd) return true;

  const promptCellByIndex = new Map<number, AlignmentCell>();
  const extraInputIndices = new Set<number>();

  // Map prompt cells and extra input cells separately so the check can reject
  // words that contain hidden inserted characters.
  alignment.cells.forEach((c) => {
    if (c.type === "prompt") promptCellByIndex.set(c.index, c);
    else extraInputIndices.add(c.inputIndex);
  });

  let minIn = Infinity;
  let maxIn = -1;

  for (let j = wordStart; j < wordEnd; j++) {
    const c = promptCellByIndex.get(j);
    // Every character in the previous word must be present and correct.
    if (
      !c ||
      c.type !== "prompt" ||
      c.status !== "correct" ||
      c.inputIndex == null
    ) {
      return false;
    }
    minIn = Math.min(minIn, c.inputIndex);
    maxIn = Math.max(maxIn, c.inputIndex);
  }

  for (const ei of extraInputIndices) {
    // Extra characters inside the word range mean the space should be treated
    // as an incorrect keystroke.
    if (ei >= minIn && ei <= maxIn) return false;
    if (ei > maxIn && ei < spaceInputIndex) return false;
  }

  return true;
}

export function computeAccuracy(
  correctKeystrokes: number,
  incorrectKeystrokes: number
): number {
  // Accuracy is calculated from recorded keystroke outcomes. With no keystrokes
  // yet, the game displays 100% rather than dividing by zero.
  const total = correctKeystrokes + incorrectKeystrokes;
  if (total === 0) return 100;
  return (correctKeystrokes / total) * 100;
}
