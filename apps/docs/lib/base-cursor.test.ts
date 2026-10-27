import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

const SEARCH_OPTION_RULE =
  '[role="dialog"]:has([role="combobox"]) [role="listbox"] [role="option"]';

const baseLayer = (): string => {
  const start = css.indexOf("@layer base {");
  const end = css.indexOf("@layer components {");
  return css.slice(start, end);
};

const ruleSelectors = (declaration: string): string => {
  const index = baseLayer().indexOf(declaration);
  const open = baseLayer().lastIndexOf("{", index);
  const close = baseLayer().lastIndexOf("}", open);
  return baseLayer().slice(close + 1, open);
};

describe("base cursor rules", () => {
  it("gives every native and ARIA control a pointer in the base layer", () => {
    const selectors = ruleSelectors("cursor: pointer;");
    for (const selector of [
      "button",
      "summary",
      "select",
      '[role="button"]',
      '[role="tab"]',
      '[role="option"]',
      '[role="menuitem"]',
      'input[type="submit"]',
      'input[type="checkbox"]',
    ]) {
      expect(selectors).toContain(selector);
    }
  });

  it("marks disabled controls after the pointer rule so they win", () => {
    const layer = baseLayer();
    const selectors = ruleSelectors("cursor: not-allowed;");
    expect(selectors).toContain(":disabled");
    expect(selectors).toContain('[aria-disabled="true"]');
    expect(layer.indexOf("cursor: not-allowed;")).toBeGreaterThan(
      layer.indexOf("cursor: pointer;"),
    );
  });

  it("keeps per-class pointer declarations out of the stylesheet", () => {
    const outsideBase = css.replace(baseLayer(), "");
    const declarations = [...outsideBase.matchAll(/([^{}]+)\{[^{}]*cursor: pointer;/g)];
    expect(declarations.map((match) => match[1]?.trim())).toEqual([SEARCH_OPTION_RULE]);
    expect(css.match(/cursor: pointer;/g)).toHaveLength(2);
  });
});
