export type ThemeMode = "system" | "light" | "dark";

export type ResolvedTheme = "light" | "dark";

export interface ThemeStoreOptions {
  readonly storageKey: string;
  readonly modes: readonly ThemeMode[];
}

export interface ThemeStore {
  readonly modes: readonly ThemeMode[];
  getMode(): ThemeMode;
  getResolved(): ResolvedTheme;
  getSystem(): ResolvedTheme;
  setMode(mode: ThemeMode): void;
  subscribe(listener: () => void): () => void;
  init(): () => void;
}

const LIGHT_QUERY = "(prefers-color-scheme: light)";
const SWITCHING_ATTRIBUTE = "data-theme-switching";

export function resolveThemeMode(mode: ThemeMode, systemPrefersLight: boolean): ResolvedTheme {
  if (mode === "system") {
    return systemPrefersLight ? "light" : "dark";
  }
  return mode;
}

export function createThemeStore({ storageKey, modes }: ThemeStoreOptions): ThemeStore {
  const fallback: ThemeMode = modes.includes("system") ? "system" : (modes[0] ?? "dark");
  const listeners = new Set<() => void>();
  let remembered: ThemeMode | null = null;
  let systemQuery: MediaQueryList | null = null;
  let generation = 0;

  function parse(stored: string | null): ThemeMode {
    return modes.find((mode) => mode === stored) ?? fallback;
  }

  function getMode(): ThemeMode {
    if (remembered !== null) {
      return remembered;
    }
    try {
      return parse(window.localStorage.getItem(storageKey));
    } catch {
      return fallback;
    }
  }

  function getSystem(): ResolvedTheme {
    return window.matchMedia(LIGHT_QUERY).matches ? "light" : "dark";
  }

  function getResolved(): ResolvedTheme {
    return resolveThemeMode(getMode(), window.matchMedia(LIGHT_QUERY).matches);
  }

  function notify(): void {
    for (const listener of [...listeners]) {
      listener();
    }
  }

  function apply(): void {
    const root = document.documentElement;
    const resolved = getResolved();
    if (root.dataset.theme === resolved) {
      return;
    }
    root.setAttribute(SWITCHING_ATTRIBUTE, "");
    root.dataset.theme = resolved;
    window.getComputedStyle(root).getPropertyValue("opacity");
    setTimeout(() => root.removeAttribute(SWITCHING_ATTRIBUTE), 1);
  }

  function refresh(): void {
    apply();
    notify();
  }

  function onSystemChange(): void {
    if (getMode() === "system") {
      refresh();
      return;
    }
    notify();
  }

  function onStorage(event: StorageEvent): void {
    if (event.key === storageKey || event.key === null) {
      remembered = null;
      refresh();
    }
  }

  return {
    modes,
    getMode,
    getResolved,
    getSystem,
    setMode(mode) {
      if (!modes.includes(mode)) {
        return;
      }
      try {
        window.localStorage.setItem(storageKey, mode);
        remembered = null;
      } catch {
        remembered = mode;
      }
      refresh();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    init() {
      apply();
      generation += 1;
      const mine = generation;
      systemQuery?.removeEventListener("change", onSystemChange);
      systemQuery = window.matchMedia(LIGHT_QUERY);
      systemQuery.addEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
      window.addEventListener("storage", onStorage);
      return () => {
        if (mine !== generation) {
          return;
        }
        systemQuery?.removeEventListener("change", onSystemChange);
        systemQuery = null;
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}
