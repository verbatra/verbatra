// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const { AiSetupPrompt } = await import("./ai-setup-prompt");

function prompt(variant: "row" | "panel"): Element | null {
  const markup = renderToStaticMarkup(<AiSetupPrompt variant={variant} />);
  return new DOMParser().parseFromString(markup, "text/html").querySelector("figure");
}

describe("AiSetupPrompt", () => {
  it("sets the panel prompt as readable body text, capped at the prose measure like a callout", () => {
    const figure = prompt("panel");
    const text = figure?.querySelector("p");
    expect(figure?.classList.contains("max-w-(--width-measure)")).toBe(true);
    expect(text?.classList.contains("text-sm")).toBe(true);
    expect(text?.className).toContain("var(--text-body)");
    expect(text?.classList.contains("text-pretty")).toBe(true);
  });

  it("keeps the install box row compact", () => {
    const text = prompt("row")?.querySelector("p");
    expect(text?.classList.contains("text-xs")).toBe(true);
    expect(text?.className).toContain("var(--text-muted)");
    expect(text?.classList.contains("text-pretty")).toBe(true);
  });

  it("gives the caption a 24px row beside the Copy button and a tighter leading when it wraps", () => {
    const caption = prompt("row")?.querySelector("figcaption");
    expect(caption?.classList.contains("min-h-6")).toBe(true);
    expect(caption?.classList.contains("leading-snug")).toBe(true);
  });
});
