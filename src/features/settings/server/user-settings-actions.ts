"use server";

import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_USER_KEYMAP_SETTINGS,
  type UserKeymapSettings,
  normalizeUserSettings,
} from "@/features/settings/lib/user-settings";

type DbTopRowMode = "always" | "layout_dependent" | "never";

function toUiTopRowMode(mode: DbTopRowMode): UserKeymapSettings["showTopRow"] {
  return mode === "layout_dependent" ? "layout-dependent" : mode;
}

function toDbTopRowMode(mode: UserKeymapSettings["showTopRow"]): DbTopRowMode {
  return mode === "layout-dependent" ? "layout_dependent" : mode;
}

function toUiSettings(
  row: {
    keymap_display_mode: "off" | "static" | "react" | "next";
    keyboard_layout: string;
    keymap_legend_style: "lowercase" | "uppercase" | "blank" | "dynamic";
    keymap_top_row_mode: DbTopRowMode;
    keymap_size: number;
    show_hands_overlay: boolean;
  },
  layoutOptions: string[]
): UserKeymapSettings {
  return normalizeUserSettings(
    {
      keymapDisplay: row.keymap_display_mode,
      keyboardLayout: row.keyboard_layout,
      legendStyle: row.keymap_legend_style,
      showTopRow: toUiTopRowMode(row.keymap_top_row_mode),
      keymapSize: row.keymap_size,
      showHandsOverlay: row.show_hands_overlay,
    },
    layoutOptions
  );
}

export async function getUserKeymapSettings(
  layoutOptions: string[]
): Promise<{ isAuthenticated: boolean; settings: UserKeymapSettings }> {
  const { userId } = await auth();
  const defaults = normalizeUserSettings(DEFAULT_USER_KEYMAP_SETTINGS, layoutOptions);

  if (!userId) {
    return { isAuthenticated: false, settings: defaults };
  }

  const row = await prisma.userSettings.findUnique({
    where: { user_id: userId },
    select: {
      keymap_display_mode: true,
      keyboard_layout: true,
      keymap_legend_style: true,
      keymap_top_row_mode: true,
      keymap_size: true,
      show_hands_overlay: true,
    },
  });

  if (!row) {
    return { isAuthenticated: true, settings: defaults };
  }

  return {
    isAuthenticated: true,
    settings: toUiSettings(
      {
        keymap_display_mode: row.keymap_display_mode,
        keyboard_layout: row.keyboard_layout,
        keymap_legend_style: row.keymap_legend_style,
        keymap_top_row_mode: row.keymap_top_row_mode as DbTopRowMode,
        keymap_size: row.keymap_size,
        show_hands_overlay: row.show_hands_overlay,
      },
      layoutOptions
    ),
  };
}

export async function saveUserKeymapSettingsAction(
  nextSettings: UserKeymapSettings,
  layoutOptions: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  const normalized = normalizeUserSettings(nextSettings, layoutOptions);

  await prisma.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { user_id: userId },
      create: { user_id: userId },
      update: {},
    });

    await tx.userSettings.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        keymap_display_mode: normalized.keymapDisplay,
        keyboard_layout: normalized.keyboardLayout,
        keymap_legend_style: normalized.legendStyle,
        keymap_top_row_mode: toDbTopRowMode(normalized.showTopRow),
        keymap_size: normalized.keymapSize,
        show_hands_overlay: normalized.showHandsOverlay,
      },
      update: {
        keymap_display_mode: normalized.keymapDisplay,
        keyboard_layout: normalized.keyboardLayout,
        keymap_legend_style: normalized.legendStyle,
        keymap_top_row_mode: toDbTopRowMode(normalized.showTopRow),
        keymap_size: normalized.keymapSize,
        show_hands_overlay: normalized.showHandsOverlay,
      },
    });
  });

  return { ok: true };
}

