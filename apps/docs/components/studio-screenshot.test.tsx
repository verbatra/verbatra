// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { docsStylesheetRules } from "@/lib/stylesheet-rules";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

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
});
