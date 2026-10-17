import { describe, expect, it } from "vitest";
import { ROW_WIDTH } from "@/components/header-parts";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";

describe("LegalFooter", () => {
  it("lines its links up with the home header row and the page column, not the wider docs layout", () => {
    const nav = rulesFor(docsStylesheetRules(), ".vk-legal-footer-nav").find(
      (rule) => rule.media === "",
    )?.declarations;
    expect(nav?.["max-width"]).toBe("var(--width-wide)");
    expect(nav?.["padding-inline"]).toBe("var(--gutter)");
    expect(ROW_WIDTH.wide).toBe("max-w-(--width-wide) px-(--gutter)");
  });
});
