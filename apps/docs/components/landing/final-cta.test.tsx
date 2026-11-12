// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DRY_RUN_COMMAND, INIT_COMMAND } from "@/lib/install-commands";
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

  it("says the path is for a project that already has locale files and needs no API key", () => {
    expect(copy.lead).toMatch(/already has locale files/);
    expect(copy.lead).toMatch(/API key/);
    expect(copy.lead.split(/\s+/).length).toBeLessThanOrEqual(30);
  });

  it("offers init, then the dry run, as its only commands, with no button of its own", () => {
    const commands = [...root.querySelectorAll("code")].map((code) => code.textContent);
    expect(commands).toEqual([INIT_COMMAND, DRY_RUN_COMMAND]);
    expect(root.querySelectorAll(".vk-final-install")).toHaveLength(1);
    expect(root.querySelectorAll("button:not(.vk-final-install button)")).toHaveLength(0);
    expect(root.querySelector(".vk-closer-actions")).toBeNull();
  });

  it("ends in one list of exactly five plain proof links under the commands, and no other link", () => {
    const list = root.querySelector(".vk-closer > .vk-final-install + ul.vk-closer-proof");
    expect(list?.getAttribute("aria-label")).toBe(copy.proof.label);
    const links = [...(list?.querySelectorAll("li > a") ?? [])];
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://www.npmjs.com/package/@verbatra/cli",
      "https://github.com/verbatra/verbatra/blob/main/LICENSE",
      "/de/docs/data-handling",
      "https://codecov.io/gh/verbatra/verbatra",
      "https://github.com/verbatra/verbatra/actions/workflows/ci.yml",
    ]);
    expect(root.querySelectorAll("a")).toHaveLength(5);
    expect(root.querySelectorAll("li")).toHaveLength(5);
    expect(list?.querySelector("button, img, svg")).toBeNull();
  });

  it("words the five facts from messages, with the enforced coverage threshold as the number", () => {
    const labels = [...root.querySelectorAll(".vk-closer-proof a")].map((link) =>
      link.firstChild?.textContent?.trim(),
    );
    expect(labels).toEqual([
      "npm provenance",
      "MIT license",
      "The CLI sends no telemetry",
      "90% coverage gate",
      "CI workflow",
    ]);
    expect(copy.proof.coverage).toBe("{threshold}% coverage gate");
  });

  it("opens other hosts in a new tab the way the footer does and keeps the docs page in the tab", () => {
    const links = [...root.querySelectorAll<HTMLAnchorElement>(".vk-closer-proof a")];
    expect(links).toHaveLength(5);
    for (const link of links) {
      const external = link.getAttribute("href")?.startsWith("https://") ?? false;
      expect(link.getAttribute("target")).toBe(external ? "_blank" : null);
      expect(link.getAttribute("rel")).toBe(external ? "noreferrer noopener" : null);
      expect(link.querySelector(".sr-only")?.textContent ?? null).toBe(
        external ? ` ${en.landing.openSource.newTab}` : null,
      );
    }
  });

  it("styles the row as a quiet list of footer links, with no raw color", () => {
    const rule = css.slice(
      css.indexOf(".vk-closer-proof {"),
      css.indexOf("\n}", css.indexOf(".vk-closer-proof {")),
    );
    expect(rule).toContain("display: flex;");
    expect(rule).toContain("flex-wrap: wrap;");
    expect(rule).toContain("justify-content: center;");
    for (const link of root.querySelectorAll(".vk-closer-proof a")) {
      expect(link.className).toBe("vk-tap vk-footer-link");
    }
    expect(css).not.toMatch(/\.vk-closer-proof[^{]*\{[^}]*(#[0-9a-f]{3,8}\b|hsl\()/i);
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
