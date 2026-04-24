import type { Metadata } from "next";

import { SettingsPageContent } from "@/features/settings/components/settings-page-content";
import { getKeyboardLayoutOptions } from "@/features/settings/lib/get-keyboard-layout-options";
import { getUserKeymapSettings } from "@/features/settings/server/user-settings-actions";

export const metadata: Metadata = {
  title: "Settings | IType",
  description: "Customize keymap and keyboard layout settings.",
};

export default async function SettingsPage() {
  const layoutOptions = await getKeyboardLayoutOptions();
  const { isAuthenticated, settings } = await getUserKeymapSettings(layoutOptions);
  return (
    <SettingsPageContent
      layoutOptions={layoutOptions}
      isAuthenticated={isAuthenticated}
      initialSettings={settings}
    />
  );
}

