import { computeAlignment, type AlignmentResult, type AlignmentCell } from "./alignment";

/**
 * Whether the last typed character (at input.length - 1) counts as correct or incorrect
 * for accuracy. Used to update cumulative correct/incorrect keystroke counts.
 *
 * Rules:
 * - Wrong character -> incorrect
 * - Extra character -> incorrect
 * - Space after a dirty (incorrect) word -> incorrect
 * - Space after a fully correct word -> correct
 * - Correct character (including retyped correct) -> correct
 * - Missed characters are not counted (we only classify the last *typed* character)
 */
export function getLastKeystrokeCorrectness(
  displayText: string,
  input: string
): "correct" | "incorrect" | null {
  if (!input.length) return null;

  const alignment = computeAlignment(displayText, input);
  const lastInputIndex = input.length - 1;

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
      const wordBeforeClean = isWordBeforeSpaceFullyCorrect(
        alignment,
        displayText,
        cell.index
      );
      return wordBeforeClean ? "correct" : "incorrect";
    }
    return "correct";
  }

  return null;
}

/**
 * True if the prompt word that ends just before the space at spacePromptIndex
 * was typed fully correctly (no wrong/skipped/extra in that word).
 */
function isWordBeforeSpaceFullyCorrect(
  alignment: AlignmentResult,
  displayText: string,
  spacePromptIndex: number
): boolean {
  const wordStart =
    displayText.lastIndexOf(" ", spacePromptIndex - 1) + 1;
  const wordEnd = spacePromptIndex;
  if (wordStart >= wordEnd) return true;

  const promptCellByIndex = new Map<number, AlignmentCell>();
  const extraInputIndices = new Set<number>();

  alignment.cells.forEach((c) => {
    if (c.type === "prompt") promptCellByIndex.set(c.index, c);
    else extraInputIndices.add(c.inputIndex);
  });

  let minIn = Infinity;
  let maxIn = -1;

  for (let j = wordStart; j < wordEnd; j++) {
    const c = promptCellByIndex.get(j);
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
    if (ei >= minIn && ei <= maxIn) return false;
  }

  return true;
}

/**
 * Accuracy = (Correct Characters / (Correct Characters + Incorrect Characters)) × 100.
 * Returns a number in [0, 100], or 100 when both counts are 0.
 */
export function computeAccuracy(
  correctKeystrokes: number,
  incorrectKeystrokes: number
): number {
  const total = correctKeystrokes + incorrectKeystrokes;
  if (total === 0) return 100;
  return (correctKeystrokes / total) * 100;
}
