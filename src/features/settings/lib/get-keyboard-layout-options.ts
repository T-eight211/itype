import { readdir } from "node:fs/promises";
import path from "node:path";

export async function getKeyboardLayoutOptions(): Promise<string[]> {
  const layoutsDir = path.join(process.cwd(), "src/data/keyboard-layouts/layouts");
  const entries = await readdir(layoutsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/i, ""))
    .sort((a, b) => a.localeCompare(b));
}

