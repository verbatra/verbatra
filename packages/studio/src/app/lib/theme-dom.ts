import { createThemeStore, type ThemeMode } from "@verbatra/ui/theme";

export type ThemePreference = ThemeMode;

export const THEME_STORAGE_KEY = "verbatra-studio-theme";

export interface ThemeOption {
  readonly value: ThemePreference;
  readonly label: string;
}

export const THEME_LABELS: Readonly<Record<ThemePreference, string>> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: "system", label: THEME_LABELS.system },
  { value: "light", label: THEME_LABELS.light },
  { value: "dark", label: THEME_LABELS.dark },
];

export const themeStore = createThemeStore({
  storageKey: THEME_STORAGE_KEY,
  modes: THEME_OPTIONS.map((option) => option.value),
});

export function initTheme(): void {
  themeStore.init();
}
