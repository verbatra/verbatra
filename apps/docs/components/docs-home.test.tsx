// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/landing/hero-facts", () => ({ HeroFacts: () => null }));
vi.mock("@/components/landing/package-install", () => ({
  PackageInstall: () => <div data-testid="install" />,
}));

const { DocsHomeHero, DocsHomeStacks } = await import("./docs-home");

function renderHero(): Document {
  const markup = renderToStaticMarkup(
    <DocsHomeHero
      headline="Translate only what changed"
      lead="Lead"
      primary={{ label: "Start", href: "/docs/first" }}
      secondary={{ label: "CLI", href: "/docs/cli" }}
      locale="de"
    />,
  );
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("DocsHomeHero: phone width", () => {
  it("caps the hero grid track at the panel width instead of the install box's content", () => {
    const install = renderHero().querySelector('[data-testid="install"]');
    const wrapper = install?.parentElement;
    const grid = wrapper?.parentElement;

    expect(grid?.classList.contains("grid")).toBe(true);
    expect(grid?.classList.contains("grid-cols-[minmax(0,1fr)]")).toBe(true);
    expect(wrapper?.classList.contains("min-w-0")).toBe(true);
    expect(wrapper?.classList.contains("w-full")).toBe(true);
  });
});

describe("DocsHomeStacks", () => {
  function renderStacks(locale: "en" | "de"): Document {
    const markup = renderToStaticMarkup(
      <DocsHomeStacks
        title="Pick your stack"
        links={[
          { label: "React", href: "/docs/pick-your-stack#react-with-i18next" },
          { label: "Flutter", href: "/docs/pick-your-stack#flutter" },
        ]}
        locale={locale}
      />,
    );
    return new DOMParser().parseFromString(markup, "text/html");
  }

  it("names the row after its title and lists every stack as a plain text link", () => {
    const nav = renderStacks("en").querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("Pick your stack");
    const links = [...(nav?.querySelectorAll("a") ?? [])];
    expect(links.map((link) => link.textContent)).toEqual(["React", "Flutter"]);
    expect(links.every((link) => link.querySelector("img, svg") === null)).toBe(true);
  });

  it("keeps the section anchor and prefixes the reader's locale", () => {
    const hrefs = [...renderStacks("de").querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/de/docs/pick-your-stack#react-with-i18next",
      "/de/docs/pick-your-stack#flutter",
    ]);
  });
});

describe("DocsHomePaths", () => {
  it("leads each card with the goal as its title and demotes the page name below the body", async () => {
    const { DocsHomePaths } = await import("./docs-home");
    const markup = renderToStaticMarkup(
      <DocsHomePaths
        cards={[
          {
            goal: "Translate a project",
            page: "Quickstart",
            body: "Install the CLI.",
            href: "/docs/quickstart",
          },
        ]}
        locale="en"
      />,
    );
    const card = new DOMParser().parseFromString(markup, "text/html").querySelector("a");
    expect([...(card?.children ?? [])].map((child) => child.textContent)).toEqual([
      "Translate a project",
      "Install the CLI.",
      "Quickstart",
    ]);
    expect(card?.querySelector(".vk-label")).toBeNull();
    expect(card?.classList.contains("grid-rows-subgrid")).toBe(true);
  });
});
