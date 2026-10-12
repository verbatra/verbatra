// @vitest-environment jsdom

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_COLORS, THEME_STORAGE_KEY } from "./theme";
import { currentTheme, setTheme, subscribeTheme } from "./theme-store";

beforeEach(() => {
  document.documentElement.className = "dark";
  document.head.innerHTML = `<meta name="theme-color" content="${THEME_COLORS.dark}"><meta name="color-scheme" content="dark">`;
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

function meta(name: string): string | null | undefined {
  return document.head.querySelector(`meta[name="${name}"]`)?.getAttribute("content");
}

describe("the theme store", () => {
  it("reads the theme the server or the init script put on <html>", () => {
    expect(currentTheme()).toBe("dark");
    document.documentElement.className = "light";
    expect(currentTheme()).toBe("light");
  });

  it("stores a choice, shows it on <html> and in the browser chrome, and tells its subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTheme(listener);
    setTheme("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(meta("theme-color")).toBe(THEME_COLORS.light);
    expect(meta("color-scheme")).toBe("light");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setTheme("dark");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("switches without running transitions, and removes the guard right after", () => {
    vi.useFakeTimers();
    setTheme("light");
    expect(document.head.querySelector("style")?.textContent).toContain("transition:none");
    vi.advanceTimersByTime(1);
    expect(document.head.querySelector("style")).toBeNull();
  });

  it("follows a choice made in another tab", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTheme(listener);
    window.dispatchEvent(
      new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "light" }),
    );
    expect(currentTheme()).toBe("light");
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: null }));
    expect(currentTheme()).toBe("dark");
    window.dispatchEvent(new StorageEvent("storage", { key: "other", newValue: "light" }));
    expect(currentTheme()).toBe("dark");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("still shows the choice when storage refuses it", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    setTheme("light");
    expect(currentTheme()).toBe("light");
    setItem.mockRestore();
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

describe("one theme source", () => {
  it.each(["components", "lib", "app"])(
    "%s reads the theme only from the store, since a theme context that changes after hydration client-renders every island still waiting for its chunk",
    (dir) => {
      for (const file of sourceFiles(join(process.cwd(), dir))) {
        const source = readFileSync(file, "utf8");
        expect(source, file).not.toMatch(/from "next-themes"|useTheme\b/);
      }
    },
  );

  it("keeps the fumadocs theme provider off", () => {
    const source = readFileSync(join(process.cwd(), "components/themed-root-provider.tsx"), "utf8");
    expect(source).toContain("const THEME_OPTIONS = { enabled: false } as const;");
    expect(source).toContain("theme={THEME_OPTIONS}");
  });
});
