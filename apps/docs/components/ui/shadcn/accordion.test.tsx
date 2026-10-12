// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { docsStylesheetRules, type StyleRule, stylesheetRules } from "@/lib/stylesheet-rules";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion";

const require = createRequire(import.meta.url);

type TailwindCompiler = { build: (candidates: string[]) => string };
type Tailwind = {
  compile: (
    css: string,
    options: {
      base: string;
      loadStylesheet: (id: string) => Promise<{ path: string; base: string; content: string }>;
    },
  ) => Promise<TailwindCompiler>;
};

async function utilityRules(classes: ReadonlyArray<string>): Promise<StyleRule[]> {
  const { compile } = require("tailwindcss") as Tailwind;
  const compiler = await compile(
    '@import "tailwindcss/theme" layer(theme);\n@import "tailwindcss/utilities" layer(utilities);\n@import "tw-animate-css";',
    {
      base: process.cwd(),
      loadStylesheet: async (id) => {
        const path =
          id === "tw-animate-css"
            ? join(process.cwd(), "node_modules/tw-animate-css/dist/tw-animate.css")
            : require.resolve(`${id}.css`);
        return { path, base: dirname(path), content: readFileSync(path, "utf8") };
      },
    },
  );
  return stylesheetRules(compiler.build([...classes]));
}

function render(): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToString(
    <Accordion type="single" collapsible defaultValue="a">
      <AccordionItem value="a">
        <AccordionTrigger>Question</AccordionTrigger>
        <AccordionContent>Answer</AccordionContent>
      </AccordionItem>
    </Accordion>,
  );
  return container;
}

function applies(rule: StyleRule, element: Element, reduced: boolean): boolean {
  if (
    /prefers-reduced-motion: (reduce)/.test(rule.media) !== reduced &&
    /prefers-reduced-motion/.test(rule.media)
  )
    return false;
  if (/@media (?!\(prefers-reduced-motion)/.test(rule.media)) return false;
  try {
    return element.matches(rule.selector);
  } catch {
    return false;
  }
}

function computed(
  rules: ReadonlyArray<StyleRule>,
  element: Element,
  property: string,
  reduced: boolean,
): string | undefined {
  return rules
    .filter((rule) => rule.declarations[property] !== undefined && applies(rule, element, reduced))
    .at(-1)?.declarations[property];
}

describe("shadcn accordion", () => {
  it("computes no trigger or chevron transition under reduced motion, and keeps them otherwise", async () => {
    const trigger = render().querySelector("button");
    const chevron = trigger?.querySelector("svg");
    for (const element of [trigger, chevron]) {
      if (!element) throw new Error("missing accordion part");
      const rules = await utilityRules([...element.classList]);
      expect(computed(rules, element, "transition-property", true)).toBe("none");
      expect(computed(rules, element, "transition-property", false)).not.toBe("none");
    }
  });

  it("computes no open or close animation for the answer under reduced motion", async () => {
    const content = render().querySelector('[data-slot="accordion-content"]');
    if (!content) throw new Error("missing accordion content");
    expect(content.getAttribute("data-state")).toBe("open");
    const utilities = await utilityRules([...content.classList]);
    expect(computed(utilities, content, "animation", false)).toContain("accordion-down");
    const unlayered = docsStylesheetRules().filter((rule) => !rule.media.includes("@layer"));
    expect(computed(unlayered, content, "animation", true)).toBe("none");
  });
});
