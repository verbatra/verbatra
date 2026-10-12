// @vitest-environment jsdom

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tabs, TabsList, TabsTrigger, tabsListVariants } from "./tabs";

function render(variant: "default" | "line"): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToString(
    <Tabs defaultValue="a">
      <TabsList variant={variant} aria-label="Ways">
        <TabsTrigger value="a">A</TabsTrigger>
        <TabsTrigger value="b">B</TabsTrigger>
      </TabsList>
    </Tabs>,
  );
  return container;
}

describe("shadcn tabs", () => {
  it("fixes the list height only on the default variant, so a line list grows with its triggers", () => {
    expect(tabsListVariants({ variant: "line" })).not.toMatch(/(^|\s|:)h-9(\s|$)/);
    expect(tabsListVariants({ variant: "default" })).toContain(
      "group-data-[orientation=horizontal]/tabs:h-9",
    );
  });

  it("draws the line underline inside the trigger box, where an overflowing list cannot clip it", () => {
    const trigger = render("line").querySelector<HTMLElement>('[role="tab"]');
    const classes = trigger?.className ?? "";
    expect(classes).toContain("group-data-[orientation=horizontal]/tabs:after:bottom-0");
    expect(classes).not.toMatch(/after:bottom-\[-/);
    expect(classes).toContain("group-data-[variant=line]/tabs-list:h-auto");
  });

  it("themes through the semantic tokens and never a dark: variant", () => {
    for (const variant of ["default", "line"] as const) {
      const html = render(variant).innerHTML;
      expect(html).not.toMatch(/\bdark:/);
      expect(html).not.toMatch(/foreground\/60|bg-input/);
    }
  });
});
