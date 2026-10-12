// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const theme = vi.hoisted(() => ({
  resolvedTheme: "dark" as string | undefined,
  setTheme: vi.fn(),
}));

vi.mock("fumadocs-ui/provider/base", () => ({ useTheme: () => theme }));
vi.mock("next-intl", async (importOriginal) => {
  const { createTranslator } = await importOriginal<typeof import("next-intl")>();
  const { default: messages } = await import("@/messages/en.json");
  return {
    useTranslations: (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
  };
});

const { ThemeToggle } = await import("./theme-toggle");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = undefined;
  theme.setTheme.mockReset();
});

function render(resolvedTheme: string | undefined): HTMLButtonElement {
  theme.resolvedTheme = resolvedTheme;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => root.render(<ThemeToggle />));
  const button = container.querySelector("button");
  if (!button) throw new Error("no toggle rendered");
  return button;
}

describe("ThemeToggle", () => {
  it("is a native toggle button named from the docs.theme messages", () => {
    const button = render("dark");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Light theme");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("reports the light theme as pressed and switches back to dark", () => {
    const button = render("light");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    act(() => button.click());
    expect(theme.setTheme).toHaveBeenCalledWith("dark");
  });

  it("switches the dark theme to light", () => {
    const button = render("dark");
    act(() => button.click());
    expect(theme.setTheme).toHaveBeenCalledWith("light");
  });

  it("renders unpressed on the server, so the markup never depends on the stored theme", () => {
    theme.resolvedTheme = "light";
    const html = renderToString(<ThemeToggle />);
    expect(html).toContain('aria-pressed="false"');
  });

  it("draws both icons and leaves the choice to the stylesheet, so nothing flashes", () => {
    const button = render("dark");
    expect(button.querySelector(".vk-theme-icon-light")).not.toBeNull();
    expect(button.querySelector(".vk-theme-icon-dark")).not.toBeNull();
    for (const icon of button.querySelectorAll("svg")) {
      expect(icon.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
