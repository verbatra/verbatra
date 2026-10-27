// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { docsStylesheetRules } from "@/lib/stylesheet-rules";
import { contrast, themeTokens } from "@/test-support/contrast";
import { NEW_PILL_CLASS, NewPill } from "./new-pill";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

const rules = docsStylesheetRules();

const PILL_LAYERS = [
  ".vk-pill-new::before",
  ".vk-pill-new-ring::before",
  ".vk-pill-new-shimmer::before",
];

describe("NewPill", () => {
  it("reads as its text alone, its ring and shimmer hidden from assistive technology", () => {
    const doc = parse(renderToStaticMarkup(<NewPill>New</NewPill>));
    const pill = doc.querySelector(`.${NEW_PILL_CLASS}`);
    expect(pill?.textContent).toBe("New");
    const layers = Array.from(pill?.children ?? []);
    expect(layers.map((layer) => layer.className)).toEqual([
      "vk-pill-new-ring",
      "vk-pill-new-shimmer",
    ]);
    for (const layer of layers) expect(layer.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("the depth pill stylesheet", () => {
  it("separates the light theme's gradient stops clearly and rims the chip, so it never reads flat", () => {
    const { light } = themeTokens();
    expect(contrast(light, "--pill-new-start", "--pill-new-end")).toBeGreaterThanOrEqual(1.6);
    expect(contrast(light, "--pill-new-fg", "--pill-new-start")).toBeGreaterThanOrEqual(4.5);
    expect(light["--pill-new-rim"]).toMatch(/var\(--pill-new-end\)/);
    const pill = docsStylesheetRules().find(
      (rule) => rule.selector === ".vk-pill-new" && rule.media === "",
    );
    expect(pill?.declarations["box-shadow"]).toBe("0 0 0 1px var(--pill-new-rim)");
  });

  it("fills the pill with the two pill tokens in white uppercase type", () => {
    const pill = rules.find((rule) => rule.selector === ".vk-pill-new" && rule.media === "");
    expect(pill?.declarations.background).toBe(
      "linear-gradient(90deg, var(--pill-new-start), var(--pill-new-end))",
    );
    expect(pill?.declarations.color).toBe("var(--pill-new-fg)");
    expect(pill?.declarations["text-transform"]).toBe("uppercase");
  });

  it("runs every pill animation three times, only when motion is welcome", () => {
    const animated = rules.filter(
      (rule) => PILL_LAYERS.includes(rule.selector) && "animation" in rule.declarations,
    );
    expect(animated.map((rule) => rule.selector).toSorted()).toEqual(PILL_LAYERS.toSorted());
    for (const rule of animated) {
      expect(rule.media).toContain("prefers-reduced-motion: no-preference");
      expect(rule.declarations.animation).toMatch(/ 4\.5s .*\b3$/);
    }
  });

  it("drops the shimmer under reduced motion", () => {
    const shimmer = rules.find(
      (rule) => rule.selector === ".vk-pill-new-shimmer" && rule.media.includes("reduce"),
    );
    expect(shimmer?.declarations.display).toBe("none");
  });

  it("keeps the pill still inside the marquee", () => {
    const still = rules.find(
      (rule) =>
        rule.selector.startsWith(".vk-marquee :is(.vk-pill-new") &&
        rule.selector.endsWith("::before"),
    );
    expect(still?.declarations["animation-name"]).toBe("none");
  });
});
