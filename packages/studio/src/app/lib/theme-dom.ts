import { createThemeStore, type ThemeMode } from "@verbatra/ui/theme";

export type ThemePreference = ThemeMode;

export const THEME_STORAGE_KEY = "verbatra-studio-theme";

export interface ThemeOption {
  readonly value: ThemePreference;
  readonly label: string;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export const themeStore = createThemeStore({
  storageKey: THEME_STORAGE_KEY,
  modes: THEME_OPTIONS.map((option) => option.value),
});

export function initTheme(): void {
  themeStore.init();
}
