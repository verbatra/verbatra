// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
    getLocale: async () => "en",
  };
});

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { Studio, STUDIO_GUIDE_PATH, STUDIO_POINTS } = await import("./studio");
const { STUDIO_RUN_COMMAND } = await import("@/lib/install-commands");

let root: HTMLElement;

beforeAll(async () => {
  root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      {await Studio()}
    </NextIntlClientProvider>,
  );
});

describe("Studio", () => {
  it("opens on the Studio heading and lead", () => {
    expect(root.querySelector("h2")?.textContent).toBe(en.landing.studio.heading);
    expect(root.textContent).toContain(en.landing.studio.lead);
  });

  it("lists what Studio shows, with commands set in code", () => {
    const items = Array.from(root.querySelectorAll("li")).map((li) => li.textContent);
    expect(items).toEqual(
      STUDIO_POINTS.map((point) => en.landing.studio.points[point].replaceAll("`", "")),
    );
    expect(Array.from(root.querySelectorAll("li code")).map((c) => c.textContent)).toEqual([
      "verbatra studio",
      "--allow-spend",
    ]);
  });

  it("shows the real review screenshot with dimensions and the translated alt", () => {
    const image = root.querySelector("img");
    expect(image?.getAttribute("alt")).toBe(en.landing.studio.alt);
    expect(Number(image?.getAttribute("width"))).toBeGreaterThan(0);
    expect(Number(image?.getAttribute("height"))).toBeGreaterThan(0);
    expect(image?.getAttribute("src")).toContain("studio-review-dark");
    for (const theme of ["dark", "light"]) {
      expect(
        existsSync(join(process.cwd(), `public/screenshots/studio-review-${theme}.webp`)),
      ).toBe(true);
    }
  });

  it("runs Studio with the command the CLI itself prints when it is missing", () => {
    expect(root.querySelector("code")?.textContent).toContain("verbatra studio");
    const cliSource = readFileSync(
      join(process.cwd(), "../../packages/cli/src/studio-command.ts"),
      "utf8",
    );
    expect(cliSource).toContain(STUDIO_RUN_COMMAND);
  });

  it("links the Studio guide, a real docs page", () => {
    const link = root.querySelector(`a[href='${STUDIO_GUIDE_PATH}']`);
    expect(link?.textContent).toBe(en.landing.studio.cta);
    expect(existsSync(join(process.cwd(), "content/docs/(guides)/review-in-studio.mdx"))).toBe(
      true,
    );
  });

  it("presents Studio as available, never as coming soon", () => {
    expect(root.textContent?.toLowerCase()).not.toContain("coming soon");
  });

  it("gives every standalone link a target at least 24px tall", () => {
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>("a.vk-prose-link"));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.className.split(" ")).toEqual(expect.arrayContaining(["inline-flex", "min-h-6"]));
    }
  });
});
