export type KeymapReactFlash = {
  // id lets React distinguish short-lived flash events even when the same key is
  // pressed repeatedly.
  id: number;
  ch: string;
  // kind controls whether the reactive key flash is green or red.
  kind: "correct" | "incorrect";
};
