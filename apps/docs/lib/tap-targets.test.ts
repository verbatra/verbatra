import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";

const PHONE = "@media (width < 768px)";
const rules = docsStylesheetRules();

const PHONE_MIN_SIZE = [
  ".vk-tap",
  ".vk-showcase-file-tab",
  ".vk-showcase-scenario",
  ".vk-showcase-reset",
  ".vk-prose-link",
  ".vk-stack-card-link",
  "[data-toc-popover-trigger]",
  "#nd-sidebar-mobile a[href]",
  "#nd-sidebar-mobile button",
  '#nd-page [role="tab"]',
  "#nd-page .group\\/heading > button",
  "figure.shiki button",
];

const TAP_CLASS_SOURCES = [
  "components/theme-toggle.tsx",
  "components/language-select.tsx",
  "components/ui/copy-control.tsx",
  "components/ui/tabs.tsx",
  "components/studio-screenshot.tsx",
  "components/landing/footer.tsx",
  "components/legal-footer.tsx",
];

describe("tap targets on a phone", () => {
  it.each(PHONE_MIN_SIZE)("gives %s at least 44 by 44 CSS px below 768px", (selector) => {
    const phone = rulesFor(rules, selector).filter((rule) => rule.media === PHONE);
    expect(phone.some((rule) => rule.declarations["min-height"] === "44px")).toBe(true);
    expect(phone.some((rule) => rule.declarations["min-width"] === "44px")).toBe(true);
  });

  it("keeps the shared tap class out of every wider layout", () => {
    expect(rulesFor(rules, ".vk-tap").map((rule) => rule.media)).toEqual([PHONE]);
  });

  it("makes the evidence links, heading anchors and breadcrumb 44px tall", () => {
    const phone = rules.filter((rule) => rule.media === PHONE);
    const height = (selector: string) =>
      phone.find((rule) => rule.selector.split(/,\s*/).includes(selector))?.declarations;
    expect(height(".vk-evidence-link")?.["min-height"]).toBe("44px");
    expect(height("#nd-page .group\\/heading > a[data-card]")?.["min-height"]).toBe("44px");
    expect(height(".vk-breadcrumb a")?.["padding-block"]).toBe("12px");
  });

  it.each(TAP_CLASS_SOURCES)("%s marks its controls with the tap class", (file) => {
    expect(readFileSync(join(process.cwd(), file), "utf8")).toContain("vk-tap");
  });
});
