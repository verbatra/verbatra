import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";

describe("LegalFooter", () => {
  it("lines its links up with the home header row and the page column, not the wider docs layout", () => {
    const nav = rulesFor(docsStylesheetRules(), ".vk-legal-footer-nav").find(
      (rule) => rule.media === "",
    )?.declarations;
    expect(nav?.["max-width"]).toBe("var(--width-wide)");
    expect(nav?.["padding-inline"]).toBe("var(--gutter)");
    const header = readFileSync(join(process.cwd(), "components/site-header.tsx"), "utf8");
    expect(header).toContain('wide: "max-w-(--width-wide) px-(--gutter)"');
  });
});
