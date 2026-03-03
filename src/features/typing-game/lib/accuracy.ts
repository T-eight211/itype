import { computeAlignment, type AlignmentResult, type AlignmentCell } from "./alignment";

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
    if (ei > maxIn && ei < spaceInputIndex) return false;
  }

  return true;
}

export function computeAccuracy(
  correctKeystrokes: number,
  incorrectKeystrokes: number
): number {
  const total = correctKeystrokes + incorrectKeystrokes;
  if (total === 0) return 100;
  return (correctKeystrokes / total) * 100;
}
