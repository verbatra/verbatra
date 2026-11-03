import { Icon, type IconName } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { Dropdown } from "./Dropdown.js";
import { THEME_OPTIONS, type ThemePreference, themeStore } from "./lib/theme-dom.js";

const PREFERENCE_ICON: Readonly<Record<ThemePreference, IconName>> = {
  system: "monitor",
  light: "sun",
  dark: "moon",
};

export function ThemeSwitcher(): ReactNode {
  const preference = useSyncExternalStore(themeStore.subscribe, themeStore.getMode);

  const activeLabel = THEME_OPTIONS.find((option) => option.value === preference)?.label ?? "";

  return (
    <Dropdown
      variant="ghost"
      align="end"
      ariaLabel={`Theme: ${activeLabel}`}
      label={<Icon name={PREFERENCE_ICON[preference]} />}
      items={THEME_OPTIONS.map((option) => ({
        id: option.value,
        label: option.label,
        selected: option.value === preference,
        onSelect: () => themeStore.setMode(option.value),
      }))}
    />
  );
}
