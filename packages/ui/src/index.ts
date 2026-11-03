export const THEMES = ["dark", "light"] as const;

export type ThemeName = (typeof THEMES)[number];
