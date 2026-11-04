// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, render } from "./test-support.tsx";
import { createThemeStore, type ThemeMode } from "./theme.ts";
import { nextThemeMode, ThemeToggle } from "./theme-toggle.tsx";

const KEY = "toggle-theme";
const ALL: readonly ThemeMode[] = ["system", "light", "dark"];

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

const label = (current: string, next: string): string => `Theme: ${current}. Switch to ${next}.`;
const announce = (mode: string): string => `Theme set to ${mode}`;

function toggle(modes: readonly ThemeMode[] = ALL, className?: string) {
  const store = createThemeStore({ storageKey: KEY, modes });
  return {
    store,
    view: render(
      <ThemeToggle
        store={store}
        label={label}
        announce={announce}
        {...(className !== undefined ? { className } : {})}
      />,
    ),
  };
}

function cycle(view: ReturnType<typeof toggle>["view"], steps: number): string[] {
  const seen = [view.get("button").dataset.mode ?? ""];
  for (let step = 0; step < steps; step += 1) {
    click(view.get("button"));
    seen.push(view.get("button").dataset.mode ?? "");
  }
  return seen;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("nextThemeMode", () => {
  it("leaves system for the opposite of the operating system theme first", () => {
    expect(nextThemeMode("system", ALL, "light")).toBe("dark");
    expect(nextThemeMode("system", ALL, "dark")).toBe("light");
  });

  it("then visits the system theme and returns to system", () => {
    expect(nextThemeMode("dark", ALL, "light")).toBe("light");
    expect(nextThemeMode("light", ALL, "light")).toBe("system");
    expect(nextThemeMode("light", ALL, "dark")).toBe("dark");
    expect(nextThemeMode("dark", ALL, "dark")).toBe("system");
  });

  it("flips between two explicit modes when there is no system mode", () => {
    const two: readonly ThemeMode[] = ["light", "dark"];

    expect(nextThemeMode("light", two, "light")).toBe("dark");
    expect(nextThemeMode("dark", two, "light")).toBe("light");
  });

  it("falls back to what the store offers when the opposite mode is missing", () => {
    expect(nextThemeMode("system", ["system", "dark"], "dark")).toBe("dark");
    expect(nextThemeMode("dark", ["system", "dark"], "light")).toBe("system");
    expect(nextThemeMode("dark", ["dark"], "light")).toBe("dark");
    expect(nextThemeMode("system", ["system"], "light")).toBe("system");
    expect(nextThemeMode("light", ["light"], "light")).toBe("light");
    expect(nextThemeMode("dark", [], "light")).toBe("dark");
  });
});

describe("ThemeToggle", () => {
  it("states the current mode and the next action in its accessible name", () => {
    installMatchMedia(true);

    const { view } = toggle();

    expect(view.get("button").getAttribute("aria-label")).toBe("Theme: system. Switch to dark.");
    expect(view.get("button").hasAttribute("title")).toBe(false);
  });

  it("cycles system, dark, light, system on a light operating system", () => {
    installMatchMedia(true);

    expect(cycle(toggle().view, 3)).toEqual(["system", "dark", "light", "system"]);
  });

  it("cycles system, light, dark, system on a dark operating system", () => {
    installMatchMedia(false);

    expect(cycle(toggle().view, 3)).toEqual(["system", "light", "dark", "system"]);
  });

  it("changes the applied theme on the very first click", () => {
    installMatchMedia(true);
    const { store, view } = toggle();
    store.init();
    const before = document.documentElement.dataset.theme;

    click(view.get("button"));

    expect(document.documentElement.dataset.theme).not.toBe(before);
  });

  it("builds the cycle from the modes the store offers", () => {
    installMatchMedia(true);

    expect(cycle(toggle(["light", "dark"]).view, 2)).toEqual(["light", "dark", "light"]);
  });

  it("persists each mode and applies it to the document", () => {
    installMatchMedia(false);
    const { view } = toggle();

    click(view.get("button"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem(KEY)).toBe("light");
  });

  it("starts from the stored mode", () => {
    installMatchMedia(true);
    window.localStorage.setItem(KEY, "dark");

    expect(toggle().view.get("button").dataset.mode).toBe("dark");
  });

  it("keeps the next action current when the operating system theme changes", () => {
    let prefersLight = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", () => ({
      get matches() {
        return prefersLight;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }));
    window.localStorage.setItem(KEY, "dark");
    const { store, view } = toggle();
    store.init();
    expect(view.get("button").getAttribute("aria-label")).toBe("Theme: dark. Switch to light.");

    prefersLight = false;
    for (const listener of listeners) {
      listener();
    }
    view.rerender(<ThemeToggle store={store} label={label} announce={announce} />);

    expect(view.get("button").getAttribute("aria-label")).toBe("Theme: dark. Switch to system.");
  });

  it("announces the new mode in a polite live region after a click, not on mount", () => {
    installMatchMedia(true);
    const { view } = toggle();
    const region = view.get("[role='status']");

    expect(region.textContent).toBe("");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.className).toContain("sr-only");
    expect(region.closest(".relative")).not.toBeNull();

    click(view.get("button"));

    expect(region.textContent).toBe("Theme set to dark");
  });

  it("draws a different decorative glyph for each mode", () => {
    installMatchMedia(true);
    const { view } = toggle();
    const glyphs: string[] = [];

    for (let step = 0; step < 3; step += 1) {
      const svg = view.get("svg");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      glyphs.push(svg.getAttribute("data-icon") ?? "");
      click(view.get("button"));
    }

    expect(glyphs).toEqual(["system", "dark", "light"]);
  });

  it("is a ghost icon button with a 44px minimum tap target on small screens", () => {
    installMatchMedia(true);

    const button = toggle(ALL, "ms-2").view.get("button");

    expect(button.dataset.variant).toBe("ghost");
    expect(button.className).toContain("ms-2");
    expect(button.className).toContain("max-md:min-h-11");
    expect(button.className).toContain("max-md:min-w-11");
    expect(button.hasAttribute("data-theme-toggle")).toBe(true);
  });

  it("shows its name in a tooltip on the inline end edge, so keyboard and pointer users see it", () => {
    installMatchMedia(true);

    const { view } = toggle();
    const bubble = view.get("[role='tooltip']");

    expect(bubble.textContent).toBe("Theme: system. Switch to dark.");
    expect(view.get("[data-slot]").dataset.side).toBe("bottom-end");
    expect(view.get("button").hasAttribute("aria-describedby")).toBe(false);
  });

  it("renders the server snapshot as system", () => {
    installMatchMedia(false);
    window.localStorage.setItem(KEY, "dark");
    const store = createThemeStore({ storageKey: KEY, modes: ALL });

    const html = renderToString(<ThemeToggle store={store} label={label} announce={announce} />);

    expect(html).toContain('data-mode="system"');
  });
});
