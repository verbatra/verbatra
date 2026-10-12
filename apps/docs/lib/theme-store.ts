import {
  applyThemeMeta,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  THEMES,
  type ThemeName,
  themeName,
} from "@/lib/theme";

const listeners = new Set<() => void>();

const NO_TRANSITIONS = "*,*::before,*::after{transition:none!important}";

function notify(): void {
  for (const listener of listeners) listener();
}

function withoutTransitions(change: () => void): void {
  const style = document.createElement("style");
  style.textContent = NO_TRANSITIONS;
  document.head.append(style);
  change();
  window.getComputedStyle(document.body).getPropertyValue("opacity");
  setTimeout(() => style.remove(), 1);
}

function showTheme(theme: ThemeName): void {
  const root = document.documentElement;
  withoutTransitions(() => {
    root.classList.remove(...THEMES);
    root.classList.add(theme);
    root.style.colorScheme = theme;
  });
  applyThemeMeta(document, theme);
  notify();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== THEME_STORAGE_KEY) return;
  showTheme(themeName(event.newValue ?? undefined));
}

export function subscribeTheme(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function currentTheme(): ThemeName {
  return document.documentElement.classList.contains("light") ? "light" : DEFAULT_THEME;
}

export function setTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
  showTheme(theme);
}
