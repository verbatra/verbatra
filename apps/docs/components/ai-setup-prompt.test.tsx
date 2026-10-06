// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const { AiSetupPrompt } = await import("./ai-setup-prompt");

function prompt(): Element | null {
  const markup = renderToStaticMarkup(<AiSetupPrompt />);
  return new DOMParser().parseFromString(markup, "text/html").querySelector("figure");
}

describe("AiSetupPrompt", () => {
  it("is a compact row under the box's command rows", () => {
    const figure = prompt();
    const text = figure?.querySelector("p");
    expect(figure?.classList.contains("border-t")).toBe(true);
    expect(text?.classList.contains("text-xs")).toBe(true);
    expect(text?.className).toContain("var(--text-muted)");
    expect(text?.classList.contains("text-pretty")).toBe(true);
  });

  it("gives the caption a 24px row beside the Copy button and a tighter leading when it wraps", () => {
    const caption = prompt()?.querySelector("figcaption");
    expect(caption?.classList.contains("min-h-6")).toBe(true);
    expect(caption?.classList.contains("leading-snug")).toBe(true);
    expect(caption?.classList.contains("flex")).toBe(true);
    expect(caption?.classList.contains("items-center")).toBe(true);
  });
});
