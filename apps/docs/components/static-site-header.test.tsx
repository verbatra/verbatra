// @vitest-environment jsdom

import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";

const stats = vi.hoisted(() => ({ stars: 1234 as number | null }));

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale: "en", messages, namespace: namespace as never }),
}));

vi.mock("@/lib/project-stats", () => ({
  loadProjectStats: async () => ({ stars: stats.stars }),
}));

const { StaticSiteHeader } = await import("./static-site-header");

async function render(locale: "en" | "de" = "en"): Promise<HTMLElement> {
  const markup = renderToStaticMarkup(await StaticSiteHeader({ locale }));
  const doc = new DOMParser().parseFromString(markup, "text/html");
  const header = doc.querySelector("header");
  if (!header) throw new Error("no header");
  return header;
}

describe("StaticSiteHeader", () => {
  it("keeps the home header's links as plain anchors, with no button to hydrate", async () => {
    const header = await render();
    expect(header.id).toBe("nd-nav");
    expect(header.querySelector("button")).toBeNull();
    const desktop = header.querySelectorAll("a:not(details a)");
    expect(Array.from(desktop, (a) => [a.getAttribute("href"), a.textContent])).toEqual([
      ["/", "verbatra"],
      ["/docs", messages.landing.topNav.docs],
      [
        "https://github.com/verbatra/verbatra/releases",
        `${messages.landing.topNav.changelog} ${messages.landing.openSource.newTab}`,
      ],
      [
        "https://github.com/verbatra/verbatra",
        `GitHub 1.2K stars ${messages.landing.openSource.newTab}`,
      ],
      ["/docs/quickstart", messages.landing.topNav.getStarted],
    ]);
  });

  it("reaches Docs, Changelog and GitHub on a phone through a details menu that needs no script", async () => {
    const menu = (await render()).querySelector("details");
    expect(menu?.classList.contains("md:hidden")).toBe(true);
    const summary = menu?.querySelector("summary");
    expect(summary?.classList.contains("vk-tap")).toBe(true);
    expect(summary?.textContent).toBe(messages.landing.topNav.menu.open);
    const links = Array.from(menu?.querySelectorAll("nav a") ?? []);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/docs",
      "https://github.com/verbatra/verbatra/releases",
      "https://github.com/verbatra/verbatra",
    ]);
    for (const link of links) {
      expect(link.classList.contains("vk-tap")).toBe(true);
      expect(link.classList.contains("min-h-11")).toBe(true);
    }
  });

  it("gives every link the shared phone tap class", async () => {
    const links = Array.from((await render()).querySelectorAll("a"));
    expect(links).toHaveLength(8);
    for (const link of links) expect(link.classList.contains("vk-tap")).toBe(true);
  });

  it("prints the build-time star count with its reserved width and never asks for live stats", async () => {
    const stars = (await render()).querySelector<HTMLElement>(".vk-nav-stars");
    expect(stars?.textContent).toBe("1.2K");
    expect(stars?.style.minInlineSize).toBe("4ch");
    stats.stars = null;
    expect((await render()).querySelector(".vk-nav-stars")).toBeNull();
    stats.stars = 1234;
  });

  it("localizes every link for a non-default locale", async () => {
    const hrefs = Array.from((await render("de")).querySelectorAll("a"), (a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toContain("/de/");
    expect(hrefs).toContain("/de/docs");
    expect(hrefs).toContain("/de/docs/quickstart");
  });
});
