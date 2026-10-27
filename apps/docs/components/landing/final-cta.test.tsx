// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DRY_RUN_COMMAND } from "@/lib/install-commands";
import en from "@/messages/en.json";
import { preloadRegisteredIslands } from "@/test-support/islands";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
    getLocale: async () => "de",
  };
});

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { FinalCta } = await import("./final-cta");

const copy = en.landing.closing;

await preloadRegisteredIslands();

let root: HTMLElement;

beforeAll(async () => {
  root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      {await FinalCta()}
    </NextIntlClientProvider>,
  );
});

const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

describe("FinalCta", () => {
  it("closes on a bracketed label, one heading and one sentence", () => {
    expect(root.querySelector("p.vk-eyebrow")?.textContent).toBe(copy.label);
    expect(root.querySelectorAll("h2")).toHaveLength(1);
    expect(root.querySelector("h2")?.textContent).toBe(copy.heading);
    const lead = root.querySelector("h2 + p")?.textContent ?? "";
    expect(lead).toBe(copy.lead);
    expect(lead.match(/[.!?](\s|$)/g)).toHaveLength(1);
  });

  it("offers the dry-run command as its one action, with no button or link", () => {
    expect(root.querySelector("code")?.textContent).toBe(DRY_RUN_COMMAND);
    expect(root.querySelectorAll("code")).toHaveLength(1);
    expect(root.querySelector("a")).toBeNull();
    expect(root.querySelector(".vk-closer-actions")).toBeNull();
  });

  it("sizes the heading from 36px to 72px", () => {
    expect(root.querySelector("h2")?.className).toBe("vk-closer-title");
    expect(css).toMatch(/\.vk-closer-title \{[^}]*font-size: clamp\(2\.25rem, 5vw, 4\.5rem\);/);
  });

  it("keeps the closing brace of the label on the last word's line", () => {
    expect(css).toContain('.vk-eyebrow::after {\n  content: "\\00a0}" / "";');
  });

  it("keeps the halo under the padding that clears the text, never behind it", () => {
    const closer = css.slice(
      css.indexOf(".vk-closer {"),
      css.indexOf("\n}", css.indexOf(".vk-closer {")),
    );
    expect(closer).toContain("--closer-halo-height");
    expect(closer).toMatch(/padding-block-end: calc\(.*\+ var\(--closer-halo-height\)\)/);
    expect(closer).toMatch(/at 78% 100%/);
  });

  it("sets the closing copy in a glow panel whose grid layer is decoration only", () => {
    const inner = root.querySelector("section > div");
    expect(inner?.className).toBe("vk-closer");
    expect(inner?.getAttribute("style")).toBeNull();
    expect(root.querySelector("section")?.getAttribute("style")).toBeNull();
    const grid = inner?.firstElementChild;
    expect(grid?.className).toBe("vk-closer-grid");
    expect(grid?.getAttribute("aria-hidden")).toBe("true");
    expect(grid?.textContent).toBe("");
    const closer = css.slice(
      css.indexOf(".vk-closer {"),
      css.indexOf("\n}", css.indexOf(".vk-closer {")),
    );
    expect(closer).toContain("text-align: center;");
    expect(closer).toContain("border-radius: var(--radius-panel);");
    expect(closer).toMatch(/radial-gradient\([^;]*var\(--halo-strong\)/);
  });

  it("opens one closer step under the section before it", () => {
    expect(css).toMatch(/--section-closer: var\(--section-lg\);/);
    expect(css).toMatch(
      /\.vk-final-cta \{\s+padding-block: var\(--section-closer\) var\(--section-sm\);/,
    );
  });
});
