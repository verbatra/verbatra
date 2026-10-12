import type { RootProviderProps } from "fumadocs-ui/provider/base";

export const THEMES = ["dark", "light"] as const;

export type ThemeName = (typeof THEMES)[number];

export const DEFAULT_THEME: ThemeName = "dark";

export const THEME_COLORS: Readonly<Record<ThemeName, string>> = {
  dark: "#0B0B12",
  light: "#F9F9FB",
};

export const THEME_PROVIDER_OPTIONS: NonNullable<RootProviderProps["theme"]> = {
  defaultTheme: DEFAULT_THEME,
  themes: [...THEMES],
  enableSystem: false,
  hotKey: false,
  disableTransitionOnChange: true,
};

export function nextTheme(resolved: string | undefined): ThemeName {
  return resolved === "light" ? "dark" : "light";
}
