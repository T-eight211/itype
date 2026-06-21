"use client";

import { useCallback, useEffect, useState } from "react";

import {
  LOCAL_USER_SETTINGS_STORAGE_KEY,
  type UserKeymapSettings,
  normalizeUserSettings,
  DEFAULT_USER_KEYMAP_SETTINGS,
} from "@/features/settings/lib/user-settings";
import {
  getKeyboardLayoutJsonAction,
  getTypingGameKeymapBundleAction,
} from "@/features/typing-game/server/typing-game-keymap-actions";
import type { KeyboardLayoutData } from "@/features/typing-game/lib/keyboard-layout-types";

// Reads guest keymap settings from browser localStorage. This only runs in the
// browser, so it guards against server-side execution with `typeof window`.
function readLocalKeymapSettings(): Partial<UserKeymapSettings> | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LOCAL_USER_SETTINGS_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<UserKeymapSettings>;
  } catch {
    return null;
  }
}

// Loads the keymap settings and layout used by the typing game. Authenticated
// users get database settings through a server action; guests merge server
// defaults with localStorage settings.
export function useTypingGameKeymap() {
  // React state here drives the keymap UI and triggers a re-render when settings
  // or layout data finish loading.
  const [settings, setSettings] = useState<UserKeymapSettings>(DEFAULT_USER_KEYMAP_SETTINGS);
  const [layout, setLayout] = useState<KeyboardLayoutData | null>(null);
  const [layoutFileName, setLayoutFileName] = useState<string>("qwerty");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // `useCallback` keeps the load function stable so effects can depend on it
  // safely.
  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const bundle = await getTypingGameKeymapBundleAction();
      setIsAuthenticated(bundle.isAuthenticated);
      setLayoutFileName(bundle.layoutFileName);
      const { layoutOptions, isAuthenticated: authed, settings: server } = bundle;

      if (authed) {
        // Signed-in users use settings from the database.
        setSettings(server);
        setLayout(server.keymapDisplay === "off" ? null : bundle.layout);
        setStatus("ready");
        return;
      }

      // Guests use browser localStorage so their settings survive page refresh on
      // the same device.
      const local = readLocalKeymapSettings();
      const merged = normalizeUserSettings(
        { ...server, ...local } as UserKeymapSettings,
        layoutOptions
      );
      setSettings(merged);
      setLayoutFileName(merged.keyboardLayout);

      if (merged.keymapDisplay === "off") {
        setLayout(null);
        setStatus("ready");
        return;
      }

      const data = await getKeyboardLayoutJsonAction(merged.keyboardLayout);
      setLayout(data);
      setStatus("ready");
    } catch {
      setStatus("error");
      setLayout(null);
    }
  }, []);

  // Initial load after the component mounts.
  useEffect(() => {
    void load();
  }, [load]);

  // Reload settings when localStorage changes in another tab or when the user
  // returns to the page after changing settings.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCAL_USER_SETTINGS_STORAGE_KEY) void load();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  return { settings, layout, layoutFileName, isAuthenticated, status, reload: load };
}
