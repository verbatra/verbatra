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

  it("reports the width the grid gives the image at each viewport, switching where the grid does", () => {
    const widthAt = (viewport: number): number => {
      const entry = studioCardShotSizes()
        .split(/,\s(?=\()|,\s(?=\d)/)
        .map((part) => /^(?:\(max-width: ([\d.]+)rem\) )?(.+)$/.exec(part))
        .find((match) => match?.[1] === undefined || viewport <= Number(match[1]) * 16);
      const expression = (entry?.[2] ?? "")
        .replace(/calc/g, "")
        .replace(/100vw/g, `${viewport}`)
        .replace(/([\d.]+)rem/g, (_, rem) => `${Number(rem) * 16}`)
        .replace(/([\d.]+)px/g, "$1");
      return Function(`return ${expression}`)() as number;
    };
    const gridWidth = (viewport: number): number => {
      const gutter = viewport >= 768 ? 40 : 24;
      const content = Math.min(viewport, 1285) - 2 * gutter;
      const columns = Math.min(3, Math.max(1, Math.floor((content + 16) / 336)));
      return (content - 16 * (columns - 1)) / columns - 2;
    };
    for (const viewport of [
      320, 391, 703, 704, 720, 767, 768, 1000, 1071, 1072, 1200, 1284, 1285,
    ]) {
      expect(widthAt(viewport), `${viewport}`).toBeCloseTo(
        gridWidth(viewport) * CARD_SHOT_SCALE,
        -1,
      );
    }
    expect(widthAt(1440)).toBeCloseTo(389 * CARD_SHOT_SCALE, -1);
    expect(widthAt(1920)).toBeCloseTo(389 * CARD_SHOT_SCALE, -1);
  });

  it("sizes the rendered images from that same list", () => {
    expect(render().querySelector("img")?.getAttribute("sizes")).toBe(studioCardShotSizes());
  });
});
