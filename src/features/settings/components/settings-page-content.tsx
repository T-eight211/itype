"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_USER_KEYMAP_SETTINGS,
  LOCAL_USER_SETTINGS_STORAGE_KEY,
  type KeymapDisplay,
  type LegendStyle,
  type ShowTopRow,
  type UserKeymapSettings,
  normalizeUserSettings,
} from "@/features/settings/lib/user-settings";
import { saveUserKeymapSettingsAction } from "@/features/settings/server/user-settings-actions";

type Props = {
  layoutOptions: string[];
  initialSettings: UserKeymapSettings;
  isAuthenticated: boolean;
};

type LayoutOption = {
  value: string;
  label: string;
};

export function SettingsPageContent({ layoutOptions, initialSettings, isAuthenticated }: Props) {
  const defaultLayout = layoutOptions.includes("qwerty") ? "qwerty" : (layoutOptions[0] ?? "qwerty");
  const layoutItems = React.useMemo<LayoutOption[]>(
    () => layoutOptions.map((layout) => ({ value: layout, label: layout })),
    [layoutOptions]
  );

  const [keymapDisplay, setKeymapDisplay] = React.useState<KeymapDisplay>(initialSettings.keymapDisplay);
  const [keyboardLayout, setKeyboardLayout] = React.useState(initialSettings.keyboardLayout || defaultLayout);
  const [legendStyle, setLegendStyle] = React.useState<LegendStyle>(initialSettings.legendStyle);
  const [showTopRow, setShowTopRow] = React.useState<ShowTopRow>(initialSettings.showTopRow);
  const [keymapSize, setKeymapSize] = React.useState(initialSettings.keymapSize);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [resetDialogOpen, setResetDialogOpen] = React.useState(false);
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (isAuthenticated) return;
    const raw = window.localStorage.getItem(LOCAL_USER_SETTINGS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as UserKeymapSettings;
      const normalized = normalizeUserSettings(parsed, layoutOptions);
      setKeymapDisplay(normalized.keymapDisplay);
      setKeyboardLayout(normalized.keyboardLayout);
      setLegendStyle(normalized.legendStyle);
      setShowTopRow(normalized.showTopRow);
      setKeymapSize(normalized.keymapSize);
    } catch {
      // Ignore malformed local data and keep server/default values.
    }
  }, [isAuthenticated, layoutOptions]);

  React.useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const clearSaveTimer = React.useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const persistKeymapSettings = React.useCallback(
    async (next: UserKeymapSettings) => {
      const normalized = normalizeUserSettings(next, layoutOptions);
      setSaveState("saving");

      if (!isAuthenticated) {
        try {
          window.localStorage.setItem(LOCAL_USER_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
          setSaveState("saved");
          clearSaveTimer();
          saveTimerRef.current = setTimeout(() => setSaveState("idle"), 2800);
        } catch {
          setSaveState("error");
          clearSaveTimer();
          saveTimerRef.current = setTimeout(() => setSaveState("idle"), 5000);
        }
        return;
      }

      const result = await saveUserKeymapSettingsAction(normalized, layoutOptions);
      setSaveState(result.ok ? "saved" : "error");
      clearSaveTimer();
      if (result.ok) {
        saveTimerRef.current = setTimeout(() => setSaveState("idle"), 2800);
      } else {
        saveTimerRef.current = setTimeout(() => setSaveState("idle"), 5000);
      }
    },
    [isAuthenticated, layoutOptions, clearSaveTimer]
  );

  const handleSave = React.useCallback(() => {
    void persistKeymapSettings({
      keymapDisplay,
      keyboardLayout,
      legendStyle,
      showTopRow,
      keymapSize,
    });
  }, [persistKeymapSettings, keymapDisplay, keyboardLayout, legendStyle, showTopRow, keymapSize]);

  const handleResetConfirmed = React.useCallback(() => {
    const defaults = normalizeUserSettings(DEFAULT_USER_KEYMAP_SETTINGS, layoutOptions);
    setKeymapDisplay(defaults.keymapDisplay);
    setKeyboardLayout(defaults.keyboardLayout);
    setLegendStyle(defaults.legendStyle);
    setShowTopRow(defaults.showTopRow);
    setKeymapSize(defaults.keymapSize);
    setResetDialogOpen(false);
    void persistKeymapSettings(defaults);
  }, [layoutOptions, persistKeymapSettings]);

  return (
    <main className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Card className="py-4 sm:py-0">
          <CardHeader className="border-b px-6 pb-4 pt-4">
            <CardTitle>Settings</CardTitle>
            <CardDescription>Configure keymap display and layout preferences.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-6 py-4">
            <section className="space-y-2">
              <Label className="text-xs text-muted-foreground">keymap</Label>
              <p className="text-sm text-muted-foreground">
                Displays your current layout while taking a test.
              </p>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={0}
                className="grid w-full grid-cols-4"
                value={keymapDisplay}
                onValueChange={(v) => v && setKeymapDisplay(v as KeymapDisplay)}
              >
                <ToggleGroupItem value="off">off</ToggleGroupItem>
                <ToggleGroupItem value="static">static</ToggleGroupItem>
                <ToggleGroupItem value="react">react</ToggleGroupItem>
                <ToggleGroupItem value="next">next</ToggleGroupItem>
              </ToggleGroup>
            </section>

            {keymapDisplay !== "off" ? (
              <>
                <section className="space-y-2">
                  <Label className="text-xs text-muted-foreground">keymap layout</Label>
                  <p className="text-sm text-muted-foreground">
                    Controls which layout is displayed on the keymap.
                  </p>
                  <Combobox
                    items={layoutItems}
                    itemToStringValue={(item) => item?.value ?? ""}
                    value={layoutItems.find((item) => item.value === keyboardLayout) ?? null}
                    onValueChange={(item) => setKeyboardLayout(item?.value ?? defaultLayout)}
                  >
                    <ComboboxTrigger
                      render={
                        <Button variant="outline" className="w-full justify-between font-normal">
                          <ComboboxValue placeholder="Select layout" />
                        </Button>
                      }
                    />
                    <ComboboxContent
                      side="bottom"
                      align="start"
                      sideOffset={4}
                      className="min-w-(--anchor-width)! w-(--anchor-width)! max-h-64!"
                    >
                      <ComboboxInput showTrigger={false} placeholder="Search layout" />
                      <ComboboxEmpty>No layouts found.</ComboboxEmpty>
                      <ComboboxList>
                        {(item) => (
                          <ComboboxItem key={item.value} value={item}>
                            {item.label}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </section>

                <section className="space-y-2">
                  <Label className="text-xs text-muted-foreground">keymap legend style</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    spacing={0}
                    className="grid w-full grid-cols-4"
                    value={legendStyle}
                    onValueChange={(v) => v && setLegendStyle(v as LegendStyle)}
                  >
                    <ToggleGroupItem value="lowercase">lowercase</ToggleGroupItem>
                    <ToggleGroupItem value="uppercase">uppercase</ToggleGroupItem>
                    <ToggleGroupItem value="blank">blank</ToggleGroupItem>
                    <ToggleGroupItem value="dynamic">dynamic</ToggleGroupItem>
                  </ToggleGroup>
                </section>

                <section className="space-y-2">
                  <Label className="text-xs text-muted-foreground">keymap show top row</Label>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    spacing={0}
                    className="grid w-full grid-cols-3"
                    value={showTopRow}
                    onValueChange={(v) => v && setShowTopRow(v as ShowTopRow)}
                  >
                    <ToggleGroupItem value="always">always</ToggleGroupItem>
                    <ToggleGroupItem value="layout-dependent">layout dependent</ToggleGroupItem>
                    <ToggleGroupItem value="never">never</ToggleGroupItem>
                  </ToggleGroup>
                </section>

                <section className="space-y-2">
                  <Label className="text-xs text-muted-foreground">keymap size</Label>
                  <p className="text-sm text-muted-foreground">Change the size of the keymap.</p>
                  <div className="flex items-center gap-4">
                    <span className="w-12 text-sm font-mono text-muted-foreground">{keymapSize.toFixed(1)}</span>
                    <input
                      aria-label="keymap size"
                      type="range"
                      min={0.5}
                      max={1.5}
                      step={0.1}
                      value={keymapSize}
                      onChange={(e) => setKeymapSize(Number(e.target.value))}
                      className="h-2 w-full cursor-pointer accent-primary"
                    />
                  </div>
                </section>
              </>
            ) : null}

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setResetDialogOpen(true)}
                  disabled={saveState === "saving"}
                >
                  Reset
                </Button>
                <Button type="button" onClick={handleSave} disabled={saveState === "saving"}>
                  {saveState === "saving" ? "Saving…" : "Save settings"}
                </Button>
              </div>
              <p
                role="status"
                aria-live="polite"
                className="min-h-5 text-sm text-muted-foreground"
              >
                {saveState === "saved" &&
                  (isAuthenticated
                    ? "Settings saved to your account."
                    : "Settings saved on this device (browser storage).")}
                {saveState === "error" &&
                  (isAuthenticated
                    ? "Could not save to your account. Try again."
                    : "Could not write to browser storage. Check permissions or disk space.")}
              </p>
            </section>

            <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset settings?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Keymap options will return to their defaults and be saved{" "}
                    {isAuthenticated ? "to your account" : "in this browser"} immediately.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <Button type="button" disabled={saveState === "saving"} onClick={handleResetConfirmed}>
                    Reset to defaults
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

