// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { initTheme, THEME_OPTIONS, THEME_STORAGE_KEY, themeStore } from "./theme-dom.js";

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

describe("theme options", () => {
  it("keeps the storage key the screenshot tooling and the head script read", () => {
    expect(THEME_STORAGE_KEY).toBe("verbatra-studio-theme");
  });

  it("covers every preference exactly once, system first", () => {
    expect(THEME_OPTIONS.map((option) => option.value)).toEqual(["system", "light", "dark"]);
  });

  it("labels every option", () => {
    for (const option of THEME_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });

  it("offers the store the same modes", () => {
    expect(themeStore.modes).toEqual(THEME_OPTIONS.map((option) => option.value));
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
