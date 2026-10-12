// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_COLORS } from "@/lib/theme";

const theme = vi.hoisted(() => ({ resolved: undefined as string | undefined }));
vi.mock("fumadocs-ui/provider/base", () => ({
  useTheme: () => ({ resolvedTheme: theme.resolved }),
}));

const { ThemeMeta } = await import("./theme-meta");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setUpHead(): void {
  document.head.innerHTML = `<meta name="theme-color" content="${THEME_COLORS.dark}"><meta name="color-scheme" content="dark">`;
}

function metaContent(name: string): string | null | undefined {
  return document.head.querySelector(`meta[name="${name}"]`)?.getAttribute("content");
}

function renderWith(resolved: string | undefined): void {
  theme.resolved = resolved;
  act(() => createRoot(document.createElement("div")).render(<ThemeMeta />));
}

afterEach(() => {
  document.head.innerHTML = "";
});

describe("ThemeMeta", () => {
  it("points the browser chrome color and color scheme at the light theme once it shows", () => {
    setUpHead();
    renderWith("light");
    expect(metaContent("theme-color")).toBe(THEME_COLORS.light);
    expect(metaContent("color-scheme")).toBe("light");
  });

  it("keeps the dark defaults for the dark theme", () => {
    setUpHead();
    renderWith("dark");
    expect(metaContent("theme-color")).toBe(THEME_COLORS.dark);
    expect(metaContent("color-scheme")).toBe("dark");
  });

  it("leaves the server values alone before the theme is known", () => {
    setUpHead();
    renderWith(undefined);
    expect(metaContent("theme-color")).toBe(THEME_COLORS.dark);
  });
});
