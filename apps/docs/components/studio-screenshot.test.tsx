// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { docsStylesheetRules } from "@/lib/stylesheet-rules";

const site = vi.hoisted(() => ({ resolvedTheme: "dark" as string | undefined }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("fumadocs-ui/provider/base", () => ({ useTheme: () => site }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(resolvedTheme: string): HTMLDivElement {
  site.resolvedTheme = resolvedTheme;
  const container = document.createElement("div");
  document.body.append(container);
  act(() => createRoot(container).render(<StudioScreenshot shot="review" alt="Review queue" />));
  return container;
}

const { StudioScreenshot } = await import("./studio-screenshot");

function render(zoomOnPhone: boolean): Document {
  const markup = renderToStaticMarkup(
    <StudioScreenshot shot="review" alt="Review queue" zoomOnPhone={zoomOnPhone} />,
  );
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("StudioScreenshot", () => {
  it("shows the whole screenshot by default", () => {
    const doc = render(false);
    expect(doc.querySelector(".vk-shot-zoom")).toBeNull();
    expect(doc.querySelector("img")?.getAttribute("sizes")).toBe("(max-width: 768px) 100vw, 900px");
  });

  it("zooms into the review table on a phone and loads an image wide enough for it", () => {
    const doc = render(true);
    expect(doc.querySelector(".vk-shot-zoom > img")).not.toBeNull();
    expect(doc.querySelector("img")?.getAttribute("sizes")).toContain("(max-width: 639px) 200vw");
    const rules = docsStylesheetRules().filter(
      (rule) =>
        rule.selector.startsWith(".vk-shot-zoom") && rule.media === "@media (width < 40rem)",
    );
    const frame = rules.find((rule) => rule.selector === ".vk-shot-zoom")?.declarations;
    const image = rules.find((rule) => rule.selector === ".vk-shot-zoom > img")?.declarations;
    expect(frame?.["aspect-ratio"]).toBe("1.94");
    expect(frame?.overflow).toBe("hidden");
    expect(image?.width).toBe("200%");
  });

  it("server-renders the dark shot, the site default", () => {
    site.resolvedTheme = "light";
    expect(render(false).querySelector("img")?.getAttribute("src")).toContain("studio-review-dark");
  });

  it("follows the site theme once hydrated, until a tab picks one", () => {
    const container = mount("light");
    const image = () => container.querySelector("img")?.getAttribute("src") ?? "";
    expect(decodeURIComponent(image())).toContain("studio-review-light");
    const dark = container.querySelector<HTMLButtonElement>('[role="tab"]');
    expect(dark?.textContent).toBe("dark");
    act(() => dark?.click());
    expect(decodeURIComponent(image())).toContain("studio-review-dark");
  });

  it("shows the dark shot on a dark site", () => {
    const container = mount("dark");
    expect(decodeURIComponent(container.querySelector("img")?.getAttribute("src") ?? "")).toContain(
      "studio-review-dark",
    );
  });
});
