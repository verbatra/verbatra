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

function themeMeta(doc: Document, name: string): HTMLMetaElement {
  const found = doc.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (found) return found;
  const created = doc.createElement("meta");
  created.name = name;
  doc.head.append(created);
  return created;
}

export function applyThemeMeta(doc: Document, theme: ThemeName): void {
  themeMeta(doc, "theme-color").content = THEME_COLORS[theme];
  themeMeta(doc, "color-scheme").content = theme;
}

export function nextTheme(resolved: string | undefined): ThemeName {
  return resolved === "light" ? "dark" : "light";
}

const UNSAFE_IN_SCRIPT = /[<\u2028\u2029]/g;

export function embed(value: unknown): string {
  return JSON.stringify(value).replace(
    UNSAFE_IN_SCRIPT,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

const DEFAULT = embed(DEFAULT_THEME);

export const THEME_INIT_SCRIPT = `(function(){var c=${embed(THEME_COLORS)},t=${DEFAULT};try{var s=localStorage.getItem(${embed(THEME_STORAGE_KEY)});if(s&&s!==${DEFAULT}&&Object.prototype.hasOwnProperty.call(c,s)){t=s;var d=document.documentElement;d.classList.remove(${THEMES.map(
  (theme) => embed(theme),
).join(
  ",",
)});d.classList.add(t);d.style.colorScheme=t}}catch(e){}[["theme-color",c[t]],["color-scheme",t]].forEach(function(p){var m=document.head.querySelector('meta[name="'+p[0]+'"]');if(!m){m=document.createElement("meta");m.name=p[0];document.head.appendChild(m)}m.content=p[1]})})()`;
