import { createThemeStore, type ThemeMode } from "@verbatra/ui/theme";

export type ThemePreference = ThemeMode;

export const THEME_STORAGE_KEY = "verbatra-studio-theme";

export const THEME_LABELS: Readonly<Record<ThemePreference, string>> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export const THEME_MODES: readonly ThemePreference[] = ["system", "light", "dark"];

export const themeStore = createThemeStore({
  storageKey: THEME_STORAGE_KEY,
  modes: THEME_MODES,
});

export function initTheme(): void {
  themeStore.init();
}
