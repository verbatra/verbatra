import { describe, expect, it } from "vitest";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";

describe("LegalFooter", () => {
  it("lines its links up with the header row: the layout width and its padding", () => {
    const rules = rulesFor(docsStylesheetRules(), ".vk-legal-footer-nav");
    const base = rules.find((rule) => rule.media === "")?.declarations;
    const wide = rules.find((rule) => rule.media === "@media (min-width: 768px)")?.declarations;
    expect(base?.["max-width"]).toBe("var(--width-layout)");
    expect(base?.["padding-inline"]).toBe("1rem");
    expect(wide?.["padding-inline"]).toBe("1.5rem");
  });
});
