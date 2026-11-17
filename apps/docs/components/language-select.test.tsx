// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({
  changed: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("fumadocs-ui/contexts/i18n", () => ({
  useI18n: () => ({
    locale: "en",
    locales: [
      { locale: "en", name: "English" },
      { locale: "de", name: "Deutsch" },
    ],
    onChange: nav.changed,
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { LocaleAwareLanguageSelect } = await import("./language-select");

let mounted: Root | undefined;

afterEach(() => {
  nav.changed.mockClear();
  window.history.replaceState(null, "", "/");
  act(() => mounted?.unmount());
  mounted = undefined;
  document.body.innerHTML = "";
});

function openPopover(): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  act(() => {
    mounted = createRoot(container);
    mounted.render(<LocaleAwareLanguageSelect />);
  });
  const trigger = container.querySelector<HTMLButtonElement>("button");
  act(() => trigger?.click());
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) throw new Error("language popover did not open");
  return dialog;
}

describe("LocaleAwareLanguageSelect", () => {
  it("names the language dialog by its visible heading", () => {
    const dialog = openPopover();
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const heading = document.getElementById(labelledBy ?? "");
    expect(dialog.contains(heading)).toBe(true);
    expect(heading?.textContent).toBe("chooseLanguage");
  });

  it("gives the trigger and every locale option the mobile tap target class", () => {
    const dialog = openPopover();
    const options = Array.from(dialog.querySelectorAll("button"));
    expect(options).toHaveLength(2);
    for (const option of options) expect(option.classList.contains("vk-tap")).toBe(true);
    expect(document.querySelector("[aria-haspopup='dialog']")?.classList.contains("vk-tap")).toBe(
      true,
    );
  });

  it("marks every option with its locale for the delegated switch report", () => {
    const dialog = openPopover();
    const marks = Array.from(dialog.querySelectorAll("button")).map((button) =>
      button.getAttribute("data-locale-switch"),
    );
    expect(marks).toEqual(["en", "de"]);
  });

  it("hands the chosen locale to the provider", () => {
    const dialog = openPopover();
    const german = Array.from(dialog.querySelectorAll("button")).find(
      (button) => button.textContent === "Deutsch",
    );
    act(() => german?.click());
    expect(nav.changed).toHaveBeenCalledWith("de");
  });
});
