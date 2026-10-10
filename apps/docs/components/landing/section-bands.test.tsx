// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) =>
    Object.assign((key: string) => `${namespace ?? ""}.${key}`, {
      rich: (key: string) => key,
      raw: () => ({}),
    }),
  getLocale: async () => "en",
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("./terminal", () => ({ Terminal: () => <div data-part="terminal" /> }));
vi.mock("./try-it", () => ({ TryIt: () => <div data-part="try-it" /> }));
vi.mock("@/components/studio-screenshot", () => ({ StudioScreenshot: () => <figure /> }));

const { Section } = await import("./section");
const { Showcase } = await import("./showcase");
const { Proof } = await import("./proof");
const { Formats } = await import("./formats");
const { Control } = await import("./control");
const { Loop } = await import("./loop");
const { Faq } = await import("./faq");

async function render(node: ReactNode | Promise<ReactNode>): Promise<Document> {
  return new DOMParser().parseFromString(renderToStaticMarkup(await node), "text/html");
}

const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

describe("landing surface bands", () => {
  it("puts a banded section's content in the shared column inside a full-width band", async () => {
    const doc = await render(
      <Section id="x" band>
        <p>content</p>
      </Section>,
    );
    const section = doc.querySelector("section#x");
    expect(section?.className).toBe("vk-band");
    expect(section?.firstElementChild?.className).toContain("vk-w-wide");
    expect(section?.firstElementChild?.className).toContain("vk-gutter");
  });

  it("alternates void and band from the showcase down: how, control and the FAQ are banded", async () => {
    const banded = async (node: Promise<ReactNode> | ReactNode) =>
      (await render(node)).querySelector("section")?.classList.contains("vk-band");
    expect(await banded(Showcase())).toBe(false);
    expect(await banded(Proof())).toBe(true);
    expect(await banded(Formats())).toBe(false);
    expect(await banded(Control())).toBe(true);
    expect(await banded(Loop())).toBe(false);
    expect(await banded(<Faq items={[]} />)).toBe(true);
  });

  it("paints the band from the semantic band token between two hairlines", () => {
    const rule = css.slice(css.indexOf(".vk-band {"), css.indexOf("}", css.indexOf(".vk-band {")));
    expect(rule).toContain("background: var(--surface-band);");
    expect(rule).toContain("border-block: 1px solid var(--border-default);");
  });
});

describe("the control section on the 12-column grid", () => {
  it("spans each of the three groups four columns from 64rem", async () => {
    const doc = await render(Control());
    const grid = doc.querySelector(".vk-control-groups");
    expect(grid?.classList.contains("vk-grid-12")).toBe(true);
    expect(grid?.querySelectorAll(":scope > .vk-control-group")).toHaveLength(3);
    expect(css).toMatch(/\.vk-control-group \{\s+--grid-span: 4;/);
  });

  it("splits a section head seven to five on the same grid", async () => {
    const doc = await render(Control());
    const head = doc.querySelector(".vk-section-head");
    expect(head?.classList.contains("vk-grid-12")).toBe(true);
    expect(head?.querySelector(".vk-section-head-title h2")).not.toBeNull();
    expect(head?.querySelector(".vk-section-head-lead")).not.toBeNull();
    expect(css).toMatch(/\.vk-section-head-title \{\s+--grid-span: 7;/);
    expect(css).toMatch(/\.vk-section-head-lead \{\s+--grid-span: 5;/);
  });
});
