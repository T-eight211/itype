"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { getKeyboardLayoutOptions } from "@/features/settings/lib/get-keyboard-layout-options";
import { getUserKeymapSettings } from "@/features/settings/server/user-settings-actions";
import {
  isKeyboardLayoutData,
  type KeyboardLayoutData,
} from "@/features/typing-game/lib/keyboard-layout-types";
import { normalizeUserSettings, type UserKeymapSettings } from "@/features/settings/lib/user-settings";

export type TypingGameKeymapBundle = {
  settings: UserKeymapSettings;
  isAuthenticated: boolean;
  layoutOptions: string[];
  layout: KeyboardLayoutData | null;
  layoutFileName: string;
};

function layoutFilePath(basename: string) {
  return path.join(
    process.cwd(),
    "src/data/keyboard-layouts/layouts",
    `${basename}.json`
  );
}

export async function getKeyboardLayoutJsonAction(
  layoutName: string
): Promise<KeyboardLayoutData | null> {
  const options = await getKeyboardLayoutOptions();
  const name = path.basename(layoutName, ".json");
  if (!options.includes(name)) return null;

  const text = await readFile(layoutFilePath(name), "utf8");
  const data: unknown = JSON.parse(text) as unknown;
  return isKeyboardLayoutData(data) ? data : null;
}

export async function getTypingGameKeymapBundleAction(): Promise<TypingGameKeymapBundle> {
  const layoutOptions = await getKeyboardLayoutOptions();
  const { isAuthenticated, settings: rawSettings } =
    await getUserKeymapSettings(layoutOptions);
  const settings = normalizeUserSettings(rawSettings, layoutOptions);

  if (settings.keymapDisplay === "off") {
    return {
      isAuthenticated,
      settings,
      layoutOptions,
      layout: null,
      layoutFileName: settings.keyboardLayout,
    };
  }

  const layout = await getKeyboardLayoutJsonAction(settings.keyboardLayout);
  return {
    isAuthenticated,
    settings,
    layoutOptions,
    layout,
    layoutFileName: settings.keyboardLayout,
  };
}
