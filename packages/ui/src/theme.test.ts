// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createThemeStore, resolveThemeMode, type ThemeMode } from "./theme.ts";

const KEY = "test-theme";
const ALL: readonly ThemeMode[] = ["system", "light", "dark"];

interface MediaStub {
  setPrefersLight(next: boolean): void;
  emitChange(): void;
  listenerCount(): number;
}

function installMatchMedia(prefersLight: boolean): MediaStub {
  let matches = prefersLight;
  const queries = new Set<Set<() => void>>();
  vi.stubGlobal("matchMedia", () => {
    const listeners = new Set<() => void>();
    queries.add(listeners);
    return {
      get matches(): boolean {
        return matches;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    } as unknown as MediaQueryList;
  });
  return {
    setPrefersLight: (next) => {
      matches = next;
    },
    emitChange: () => {
      for (const listeners of queries) {
        for (const listener of [...listeners]) listener();
      }
    },
    listenerCount: () => [...queries].reduce((total, listeners) => total + listeners.size, 0),
  };
}

function breakStorage(): void {
  const denied = (): never => {
    throw new Error("storage is not available");
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(denied);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(denied);
}

function applied(): string | undefined {
  return document.documentElement.dataset.theme;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute("data-theme-switching");
});

describe("resolveThemeMode", () => {
  it("passes an explicit mode through whatever the OS prefers", () => {
    expect(resolveThemeMode("light", false)).toBe("light");
    expect(resolveThemeMode("dark", true)).toBe("dark");
  });

  it("resolves system from the OS preference", () => {
    expect(resolveThemeMode("system", true)).toBe("light");
    expect(resolveThemeMode("system", false)).toBe("dark");
  });
});

describe("createThemeStore", () => {
  it("reads system when nothing is stored", () => {
    installMatchMedia(true);
    expect(createThemeStore({ storageKey: KEY, modes: ALL }).getMode()).toBe("system");
  });

  it("falls back to system for an unknown stored value", () => {
    installMatchMedia(true);
    window.localStorage.setItem(KEY, "solarized");
    expect(createThemeStore({ storageKey: KEY, modes: ALL }).getMode()).toBe("system");
  });

  it("falls back to the first mode when system is not offered", () => {
    installMatchMedia(true);
    const store = createThemeStore({ storageKey: KEY, modes: ["light", "dark"] });
    expect(store.getMode()).toBe("light");
  });

  it("falls back to dark when no mode is offered", () => {
    installMatchMedia(true);
    expect(createThemeStore({ storageKey: KEY, modes: [] }).getMode()).toBe("dark");
  });

  it("ignores a mode outside the offered set", () => {
    installMatchMedia(true);
    const store = createThemeStore({ storageKey: KEY, modes: ["light", "dark"] });
    store.setMode("system");
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(applied()).toBeUndefined();
  });

  it("writes the resolved theme on init, never the mode", () => {
    installMatchMedia(true);
    window.localStorage.setItem(KEY, "system");
    createThemeStore({ storageKey: KEY, modes: ALL }).init();
    expect(applied()).toBe("light");
  });

  it("applies a stored explicit mode over the OS preference", () => {
    installMatchMedia(false);
    window.localStorage.setItem(KEY, "light");
    createThemeStore({ storageKey: KEY, modes: ALL }).init();
    expect(applied()).toBe("light");
  });

  it("stores, applies and announces a chosen mode", () => {
    installMatchMedia(false);
    const store = createThemeStore({ storageKey: KEY, modes: ALL });
    const listener = vi.fn();
    store.subscribe(listener);

    store.setMode("light");

    expect(window.localStorage.getItem(KEY)).toBe("light");
    expect(store.getMode()).toBe("light");
    expect(store.getResolved()).toBe("light");
    expect(applied()).toBe("light");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops announcing after unsubscribe", () => {
    installMatchMedia(false);
    const store = createThemeStore({ storageKey: KEY, modes: ALL });
    const listener = vi.fn();
    store.subscribe(listener)();
    store.setMode("dark");
    expect(listener).not.toHaveBeenCalled();
  });

  it("follows an OS change only while the mode is system", () => {
    const media = installMatchMedia(false);
    const store = createThemeStore({ storageKey: KEY, modes: ALL });
    store.init();
    expect(applied()).toBe("dark");

    media.setPrefersLight(true);
    media.emitChange();
    expect(applied()).toBe("light");

    store.setMode("dark");
    media.setPrefersLight(false);
    media.setPrefersLight(true);
    media.emitChange();
    expect(applied()).toBe("dark");
  });

  it("keeps one OS listener across repeated init calls", () => {
    const media = installMatchMedia(false);
    const store = createThemeStore({ storageKey: KEY, modes: ALL });
    store.init();
    const stop = store.init();
    expect(media.listenerCount()).toBe(1);
    stop();
  });

  it("removes its OS and storage listeners when the init cleanup runs", () => {
    const media = installMatchMedia(false);
    const store = createThemeStore({ storageKey: KEY, modes: ALL });
    const listener = vi.fn();
    store.subscribe(listener);

    store.init()();

    expect(media.listenerCount()).toBe(0);
    window.localStorage.setItem(KEY, "light");
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    expect(listener).not.toHaveBeenCalled();
  });

  it("reports the operating system theme whatever mode is chosen", () => {
    const media = installMatchMedia(true);
    const store = createThemeStore({ storageKey: KEY, modes: ALL });
    store.setMode("dark");

    expect(store.getSystem()).toBe("light");
    expect(store.getResolved()).toBe("dark");

    media.setPrefersLight(false);
    expect(store.getSystem()).toBe("dark");
  });

  it("lets a stale init cleanup leave the newer init's listeners in place", () => {
    const media = installMatchMedia(false);
    const store = createThemeStore({ storageKey: KEY, modes: ALL });
    const listener = vi.fn();
    store.subscribe(listener);
    const stale = store.init();
    const current = store.init();

    stale();

    expect(media.listenerCount()).toBe(1);
    window.localStorage.setItem(KEY, "light");
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    expect(listener).toHaveBeenCalledTimes(1);

    current();
    expect(media.listenerCount()).toBe(0);
  });

  it("re-applies when another tab changes the stored mode", () => {
    installMatchMedia(false);
    const store = createThemeStore({ storageKey: KEY, modes: ALL });
    const listener = vi.fn();
    store.subscribe(listener);
    store.init();

    window.localStorage.setItem(KEY, "light");
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    expect(applied()).toBe("light");

    window.localStorage.setItem(KEY, "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(applied()).toBe("dark");

    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("suppresses transitions only while a change is applied", () => {
    vi.useFakeTimers();
    installMatchMedia(false);
    const store = createThemeStore({ storageKey: KEY, modes: ALL });
    store.init();
    expect(document.documentElement.hasAttribute("data-theme-switching")).toBe(true);
    vi.runAllTimers();
    expect(document.documentElement.hasAttribute("data-theme-switching")).toBe(false);

    store.setMode("dark");
    expect(document.documentElement.hasAttribute("data-theme-switching")).toBe(false);
  });

  it("never injects a style element", () => {
    installMatchMedia(false);
    const store = createThemeStore({ storageKey: KEY, modes: ALL });
    store.init();
    store.setMode("light");
    expect(document.querySelector("style")).toBeNull();
  });

  it("keeps working in memory when storage is unavailable", () => {
    installMatchMedia(true);
    breakStorage();
    const store = createThemeStore({ storageKey: KEY, modes: ALL });
    expect(store.getMode()).toBe("system");

    store.setMode("dark");

    expect(store.getMode()).toBe("dark");
    expect(applied()).toBe("dark");
  });

  it("keeps an explicit in-session choice when the OS flips, even though storage never took it", () => {
    breakStorage();
    const media = installMatchMedia(false);
    const store = createThemeStore({ storageKey: KEY, modes: ALL });
    store.init();
    expect(applied()).toBe("dark");

    store.setMode("light");
    media.emitChange();

    expect(applied()).toBe("light");
  });

  it("keeps the choice when only the write fails and the read still works", () => {
    installMatchMedia(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    const store = createThemeStore({ storageKey: KEY, modes: ALL });
    store.init();

    store.setMode("light");

    expect(store.getMode()).toBe("light");
    expect(applied()).toBe("light");
  });

  it("lets another tab's stored mode replace a choice storage never took", () => {
    installMatchMedia(false);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    const store = createThemeStore({ storageKey: KEY, modes: ALL });
    const stop = store.init();
    store.setMode("light");
    setItem.mockRestore();

    window.localStorage.setItem(KEY, "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));

    expect(store.getMode()).toBe("dark");
    expect(applied()).toBe("dark");
    stop();
  });

  it("resumes tracking the OS once the user returns to the system mode", () => {
    const media = installMatchMedia(true);
    const store = createThemeStore({ storageKey: KEY, modes: ALL });
    store.init();
    store.setMode("dark");
    store.setMode("system");

    media.setPrefersLight(false);
    media.emitChange();

    expect(applied()).toBe("dark");
  });
});
