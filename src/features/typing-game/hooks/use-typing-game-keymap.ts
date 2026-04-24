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

export function useTypingGameKeymap() {
  const [settings, setSettings] = useState<UserKeymapSettings>(DEFAULT_USER_KEYMAP_SETTINGS);
  const [layout, setLayout] = useState<KeyboardLayoutData | null>(null);
  const [layoutFileName, setLayoutFileName] = useState<string>("qwerty");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const bundle = await getTypingGameKeymapBundleAction();
      setIsAuthenticated(bundle.isAuthenticated);
      setLayoutFileName(bundle.layoutFileName);
      const { layoutOptions, isAuthenticated: authed, settings: server } = bundle;

      if (authed) {
        setSettings(server);
        setLayout(server.keymapDisplay === "off" ? null : bundle.layout);
        setStatus("ready");
        return;
      }

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

  useEffect(() => {
    void load();
  }, [load]);

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
