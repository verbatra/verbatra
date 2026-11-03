// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY } from "./lib/theme-dom.js";
import { ThemeSwitcher } from "./ThemeSwitcher.js";
import { click, render } from "./test-support.js";

const TRIGGER = "button[aria-haspopup='true']";
const ITEM = "button:not([aria-haspopup])";

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

describe("ThemeSwitcher", () => {
  it("starts on the system preference when nothing was stored", () => {
    installMatchMedia(true);

    const view = render(<ThemeSwitcher />);

    expect(view.get(TRIGGER).getAttribute("aria-label")).toBe("Theme: System");
  });

  it("starts on the stored preference, so a reload keeps the user's pick", () => {
    installMatchMedia(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    const view = render(<ThemeSwitcher />);

    expect(view.get(TRIGGER).getAttribute("aria-label")).toBe("Theme: Dark");
  });

  it("shows the monitor glyph for the system preference", () => {
    installMatchMedia(true);

    const view = render(<ThemeSwitcher />);

    expect(view.get(TRIGGER).querySelector("rect")).not.toBeNull();
  });

  it("shows a different glyph once an explicit theme is the current preference", () => {
    installMatchMedia(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    const view = render(<ThemeSwitcher />);

    expect(view.get(TRIGGER).querySelector("rect")).toBeNull();
  });

  it("offers every theme option, with the current one checked", () => {
    installMatchMedia(true);

    const view = render(<ThemeSwitcher />);
    click(view.get(TRIGGER));

    expect(view.all(ITEM).map((item) => item.textContent)).toEqual(["System", "Light", "Dark"]);
    expect(view.getByText(ITEM, "System").getAttribute("aria-current")).toBe("true");
  });

  it("persists the chosen preference", () => {
    installMatchMedia(true);
    const view = render(<ThemeSwitcher />);

    click(view.get(TRIGGER));
    click(view.getByText(ITEM, "Dark"));

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("applies the chosen preference to the document root immediately", () => {
    installMatchMedia(true);
    const view = render(<ThemeSwitcher />);

    click(view.get(TRIGGER));
    click(view.getByText(ITEM, "Dark"));

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("resolves the system option against the OS scheme when it is picked", () => {
    installMatchMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    const view = render(<ThemeSwitcher />);

    click(view.get(TRIGGER));
    click(view.getByText(ITEM, "System"));

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("retitles the trigger and moves the check after a choice", () => {
    installMatchMedia(true);
    const view = render(<ThemeSwitcher />);

    click(view.get(TRIGGER));
    click(view.getByText(ITEM, "Light"));
    click(view.get(TRIGGER));

    expect(view.get(TRIGGER).getAttribute("aria-label")).toBe("Theme: Light");
    expect(view.getByText(ITEM, "Light").getAttribute("aria-current")).toBe("true");
    expect(view.getByText(ITEM, "System").hasAttribute("aria-current")).toBe(false);
  });
});
