import defaultUserSettingsJson from "@/data/settings/default-user-settings.json";

export type KeymapDisplay = "off" | "static" | "react" | "next";
export type LegendStyle = "lowercase" | "uppercase" | "blank" | "dynamic";
export type ShowTopRow = "always" | "layout-dependent" | "never";

export type UserKeymapSettings = {
  keymapDisplay: KeymapDisplay;
  keyboardLayout: string;
  legendStyle: LegendStyle;
  showTopRow: ShowTopRow;
  keymapSize: number;
  /** Show touch-typing SVG hands over the keymap (QWERTY + `next` mode only). */
  showHandsOverlay: boolean;
};

export const LOCAL_USER_SETTINGS_STORAGE_KEY = "itype:user-settings:v1";

export const DEFAULT_USER_KEYMAP_SETTINGS: UserKeymapSettings =
  defaultUserSettingsJson as UserKeymapSettings;

export function normalizeUserSettings(
  settings: UserKeymapSettings,
  layoutOptions: string[]
): UserKeymapSettings {
  const defaultLayout = layoutOptions.includes("qwerty")
    ? "qwerty"
    : (layoutOptions[0] ?? DEFAULT_USER_KEYMAP_SETTINGS.keyboardLayout);

  const keyboardLayout = layoutOptions.includes(settings.keyboardLayout)
    ? settings.keyboardLayout
    : defaultLayout;

  const keymapSize = Number.isFinite(settings.keymapSize)
    ? Math.min(1.5, Math.max(0.5, settings.keymapSize))
    : DEFAULT_USER_KEYMAP_SETTINGS.keymapSize;

  const showHandsOverlay =
    typeof settings.showHandsOverlay === "boolean"
      ? settings.showHandsOverlay
      : DEFAULT_USER_KEYMAP_SETTINGS.showHandsOverlay;

  return {
    ...settings,
    keyboardLayout,
    keymapSize,
    showHandsOverlay,
  };
}

