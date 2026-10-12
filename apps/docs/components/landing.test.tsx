import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VMark } from "./landing";

describe("VMark", () => {
  it("draws the mark flat, since the hero glow is the page's only glow", () => {
    for (const decorative of [true, false]) {
      const markup = renderToStaticMarkup(<VMark decorative={decorative} />);
      expect(markup).not.toContain("drop-shadow");
      expect(markup).not.toContain("filter");
    }
  });

  it("names the mark unless it is decorative", () => {
    expect(renderToStaticMarkup(<VMark />)).toContain('aria-label="verbatra"');
    const decorative = renderToStaticMarkup(<VMark decorative />);
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain("aria-label");
  });
});
