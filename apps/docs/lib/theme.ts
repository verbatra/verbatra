export const THEMES = ["dark", "light"] as const;

export type ThemeName = (typeof THEMES)[number];

export const DEFAULT_THEME: ThemeName = "dark";

export const THEME_COLORS: Readonly<Record<ThemeName, string>> = {
  dark: "#0B0B12",
  light: "#F9F9FB",
};

export const THEME_STORAGE_KEY = "theme";

export function themeName(resolved: string | undefined): ThemeName {
  return resolved === "light" ? "light" : DEFAULT_THEME;
}

export function applyThemeMeta(doc: Document, theme: ThemeName): void {
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", THEME_COLORS[theme]);
  }
  for (const meta of doc.querySelectorAll('meta[name="color-scheme"]')) {
    meta.setAttribute("content", theme);
  }
}

export function nextTheme(resolved: string | undefined): ThemeName {
  return resolved === "light" ? "dark" : "light";
}

export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var c=${JSON.stringify(THEME_COLORS)};if(t&&t!==${JSON.stringify(
  DEFAULT_THEME,
)}&&Object.prototype.hasOwnProperty.call(c,t)){var d=document.documentElement;d.classList.remove(${THEMES.map(
  (theme) => JSON.stringify(theme),
).join(
  ",",
)});d.classList.add(t);d.style.colorScheme=t;document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",c[t])});document.querySelectorAll('meta[name="color-scheme"]').forEach(function(m){m.setAttribute("content",t)})}}catch(e){}`;
