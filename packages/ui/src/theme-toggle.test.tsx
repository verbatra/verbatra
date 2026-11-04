// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, render } from "./test-support.tsx";
import { createThemeStore } from "./theme.ts";
import { ThemeToggle } from "./theme-toggle.tsx";

const KEY = "toggle-theme";

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

function store() {
  return createThemeStore({ storageKey: KEY, modes: ["system", "light", "dark"] });
}

const label = (current: string, next: string): string => `Theme: ${current}. Switch to ${next}.`;

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("ThemeToggle", () => {
  it("states the current mode and the next action in its accessible name", () => {
    installMatchMedia(true);

    const button = render(<ThemeToggle store={store()} label={label} />).get("button");

    expect(button.getAttribute("aria-label")).toBe("Theme: system. Switch to light.");
    expect(button.getAttribute("title")).toBe("Theme: system. Switch to light.");
  });

  it("cycles system, light, dark, then back to system", () => {
    installMatchMedia(true);
    const themes = store();
    const view = render(<ThemeToggle store={themes} label={label} />);
    const seen: string[] = [view.get("button").dataset.mode ?? ""];

    for (let step = 0; step < 3; step += 1) {
      click(view.get("button"));
      seen.push(view.get("button").dataset.mode ?? "");
    }

    expect(seen).toEqual(["system", "light", "dark", "system"]);
    expect(view.get("button").getAttribute("aria-label")).toBe("Theme: system. Switch to light.");
  });

  it("applies each mode to the document and persists it", () => {
    installMatchMedia(false);
    const view = render(<ThemeToggle store={store()} label={label} />);

    click(view.get("button"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem(KEY)).toBe("light");

    click(view.get("button"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(view.get("button").getAttribute("aria-label")).toBe("Theme: dark. Switch to system.");
  });

  it("starts from the stored mode", () => {
    installMatchMedia(true);
    window.localStorage.setItem(KEY, "dark");

    const button = render(<ThemeToggle store={store()} label={label} />).get("button");

    expect(button.dataset.mode).toBe("dark");
  });

  it("draws a different decorative glyph for each mode", () => {
    installMatchMedia(true);
    const view = render(<ThemeToggle store={store()} label={label} />);
    const glyphs: string[] = [];

    for (let step = 0; step < 3; step += 1) {
      const svg = view.get("svg");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      glyphs.push(svg.getAttribute("data-icon") ?? "");
      click(view.get("button"));
    }

    expect(glyphs).toEqual(["system", "light", "dark"]);
  });

  it("is a named ghost icon button that takes extra classes", () => {
    installMatchMedia(true);

    const button = render(<ThemeToggle store={store()} label={label} className="ms-2" />).get(
      "button",
    );

    expect(button.dataset.variant).toBe("ghost");
    expect(button.className).toContain("ms-2");
    expect(button.hasAttribute("data-theme-toggle")).toBe(true);
  });
});
