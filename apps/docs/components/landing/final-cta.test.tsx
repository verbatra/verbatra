// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";
import en from "@/messages/en.json";
import { preloadRegisteredIslands } from "@/test-support/islands";
import { GITHUB_URL } from "./links";

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
  it("closes on one heading and one sentence", () => {
    expect(root.querySelectorAll("h2")).toHaveLength(1);
    expect(root.querySelector("h2")?.textContent).toBe(copy.heading);
    const lead = root.querySelector("p")?.textContent ?? "";
    expect(lead).toBe(copy.lead);
    expect(lead.match(/[.!?](\s|$)/g)).toHaveLength(1);
  });

  it("keeps the install command, the quickstart in the reader's locale and the repository in a new tab", () => {
    expect(root.querySelector("code")?.textContent).toBe(NPM_INSTALL_COMMAND);
    expect(root.querySelector("a[href='/de/docs/quickstart']")?.textContent).toBe(copy.primary);
    const github = root.querySelector(`a[href='${GITHUB_URL}']`);
    expect(github?.textContent).toBe(`${copy.secondary} ${en.landing.openSource.newTab}`);
    expect(github?.getAttribute("target")).toBe("_blank");
    expect(github?.getAttribute("rel")).toBe("noreferrer noopener");
  });

  it("sets the closing copy on the page gutter, with no card border, inset, wash or glow", () => {
    const inner = root.querySelector("section > div");
    expect(inner?.className).toBe("vk-closer");
    expect(inner?.getAttribute("style")).toBeNull();
    expect(root.querySelector("section")?.getAttribute("style")).toBeNull();
    const closer = css.slice(
      css.indexOf(".vk-closer {"),
      css.indexOf("}", css.indexOf(".vk-closer {")),
    );
    expect(closer).toContain("text-align: center;");
    expect(closer).not.toMatch(/gradient|shadow|border/);
  });

  it("opens one closer step under the section before it", () => {
    expect(css).toMatch(/--section-closer: var\(--section-lg\);/);
    expect(css).toMatch(
      /\.vk-final-cta \{\s+padding-block: var\(--section-closer\) var\(--section-md\);/,
    );
  });
});
