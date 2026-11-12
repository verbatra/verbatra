// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { docsStylesheetRules } from "@/lib/stylesheet-rules";
import { CARD_SHOT_SCALE, StudioCardShot, studioCardShotSizes } from "./studio-card-shot";

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
      "vk-feature-shot vk-feature-shot-dark",
      "vk-feature-shot vk-feature-shot-light",
    ]);
    for (const image of images) {
      expect(image.getAttribute("alt")).toBe("");
      expect(image.getAttribute("aria-hidden")).toBe("true");
      expect(image.getAttribute("loading")).toBe("lazy");
      expect(image.getAttribute("width")).toBe("2880");
      expect(image.getAttribute("height")).toBe("1280");
      expect(image.getAttribute("fetchpriority")).toBeNull();
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
    expect(rule(".vk-feature-shot-light").display).toBe("none");
    expect(rule("html.light .vk-feature-shot-light").display).toBe("block");
    expect(rule("html.light .vk-feature-shot-dark").display).toBe("none");
  });

  it("crops through the image's own view box, so its box never leaves the visual", () => {
    const visual = rule(".vk-feature-visual:has(.vk-feature-shot)");
    expect(Number(visual["--feature-shot-scale"])).toBe(CARD_SHOT_SCALE);
    for (const name of ["--feature-shot-x", "--feature-shot-y", "--feature-shot-height"]) {
      expect(visual[name], name).toMatch(/^\d+(\.\d+)?%$/);
    }
    const shot = rule(".vk-feature-shot");
    expect(shot.position).toBe("absolute");
    expect(shot.inset).toBe("0");
    expect(shot.width).toBe("100%");
    expect(shot.height).toBe("100%");
    expect(shot["object-fit"]).toBe("cover");
    expect(shot["object-position"]).toBe("0 0");
    expect(shot["object-view-box"]?.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")")).toBe(
      "inset(var(--feature-shot-y) calc(100% - var(--feature-shot-x) - 100% / var(--feature-shot-scale)) calc(100% - var(--feature-shot-y) - var(--feature-shot-height)) var(--feature-shot-x))",
    );
    expect(rule(".vk-feature-visual").overflow).toBe("hidden");
  });

  it("falls back to an oversized, offset image where object-view-box is unsupported", () => {
    const fallback = docsStylesheetRules().find(
      (entry) =>
        entry.selector === ".vk-feature-shot" &&
        entry.media === "@supports not (object-view-box: inset(0))",
    )?.declarations;
    expect(fallback?.width).toBe("calc(var(--feature-shot-scale) * 100%)");
    expect(fallback?.["max-width"]).toBe("none");
    expect(fallback?.["object-fit"]).toBe("fill");
    expect(fallback?.translate).toBe(
      "calc(var(--feature-shot-x) * -1) calc(var(--feature-shot-y) * -1)",
    );
  });

  it("sizes the image from the same scale as the stylesheet, in viewport units", () => {
    const sizes = studioCardShotSizes();
    expect(sizes).toContain(`* ${CARD_SHOT_SCALE})`);
    expect(sizes).toMatch(/100vw/);
    expect(render().querySelector("img")?.getAttribute("sizes")).toBe(sizes);
  });
});
