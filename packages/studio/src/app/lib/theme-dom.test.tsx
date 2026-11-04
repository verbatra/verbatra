// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  initTheme,
  THEME_LABELS,
  THEME_MODES,
  THEME_STORAGE_KEY,
  themeStore,
} from "./theme-dom.js";

function installMatchMedia(prefersLight: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    () =>
      ({
        matches: prefersLight,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("theme modes", () => {
  it("keeps the storage key the screenshot tooling and the head script read", () => {
    expect(THEME_STORAGE_KEY).toBe("verbatra-studio-theme");
  });

  it("covers every preference exactly once, system first", () => {
    expect(THEME_MODES).toEqual(["system", "light", "dark"]);
  });

  it("labels every mode", () => {
    for (const mode of THEME_MODES) {
      expect(THEME_LABELS[mode].length).toBeGreaterThan(0);
    }
  });

  it("offers the store the same modes", () => {
    expect(themeStore.modes).toEqual(THEME_MODES);
  });
});

describe("initTheme", () => {
  it("applies the stored preference at startup", () => {
    installMatchMedia(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    initTheme();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applies the OS-resolved theme at startup when no preference is stored", () => {
    installMatchMedia(true);

    initTheme();

    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
