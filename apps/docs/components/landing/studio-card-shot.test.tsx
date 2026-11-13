// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { docsStylesheetRules } from "@/lib/stylesheet-rules";
import { CARD_SHOT_SIZES, StudioCardShot } from "./studio-card-shot";

function render(): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(<StudioCardShot />), "text/html");
}

function rule(selector: string): Readonly<Record<string, string>> {
  return Object.assign(
    {},
    ...docsStylesheetRules()
      .filter((entry) => entry.selector === selector && entry.media === "")
      .map((entry) => entry.declarations),
  );
}

function source(file: string): string {
  return readFileSync(join(process.cwd(), file), "utf8");
}

describe("StudioCardShot", () => {
  it("draws the dark and the light overview as two decorative lazy images at their intrinsic size", () => {
    const images = Array.from(render().querySelectorAll("img"));
    expect(images.map((image) => decodeURIComponent(image.getAttribute("src") ?? ""))).toEqual([
      expect.stringContaining("/screenshots/studio-overview-dark.webp"),
      expect.stringContaining("/screenshots/studio-overview-light.webp"),
    ]);
    expect(images.map((image) => image.getAttribute("class"))).toEqual([
      "vk-deck-shot vk-deck-shot-dark",
      "vk-deck-shot vk-deck-shot-light",
    ]);
    for (const image of images) {
      expect(image.getAttribute("alt")).toBe("");
      expect(image.getAttribute("aria-hidden")).toBe("true");
      expect(image.getAttribute("loading")).toBe("lazy");
      expect(image.getAttribute("width")).toBe("2880");
      expect(image.getAttribute("height")).toBe("1280");
      expect(image.getAttribute("fetchpriority")).toBeNull();
      expect(image.getAttribute("sizes")).toBe(CARD_SHOT_SIZES);
    }
  });

  it("is a server component: no client directive, no theme hook, no translations, no frame", () => {
    const text = source("components/landing/studio-card-shot.tsx");
    expect(text).not.toMatch(/["']use client["']/);
    expect(text).not.toMatch(/use-site-theme|next-intl|panel-caption|studio-screenshot/);
  });

  it("keeps the framed client component out of the features section", () => {
    const text = source("components/landing/features.tsx");
    expect(text).toContain("./studio-card-shot");
    expect(text).not.toMatch(/studio-screenshot|use-site-theme/);
  });

  it("shows one image from the pre-paint theme class, by the stylesheet alone", () => {
    expect(rule(".vk-deck-shot-light, html.light .vk-deck-shot-dark").display).toBe("none");
    expect(rule("html.light .vk-deck-shot-light").display).toBe("block");
  });

  it("trims the empty dashboard margins inside a frame that clips, never over the text", () => {
    const frame = rule(".vk-deck-shot-frame");
    expect(frame.overflow).toBe("hidden");
    expect(frame["aspect-ratio"]).toBe("2246 / 1229");
    const shot = rule(".vk-deck-shot");
    expect(shot.width).toBe("128.2%");
    expect(shot["margin-inline-start"]).toBe("-14.1%");
    expect(shot.height).toBe("auto");
  });

  it("asks for a one pixel candidate below the deck layout and the stage width above it", () => {
    expect(CARD_SHOT_SIZES.split(", ")).toEqual([
      "(max-width: 63.9375rem) 1px",
      "(max-width: 80rem) 62vw",
      "760px",
    ]);
  });
});
