// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/landing/hero-facts", () => ({ HeroFacts: () => null }));
vi.mock("@/components/landing/package-install", () => ({
  PackageInstall: () => <div data-testid="install" />,
}));

const { DocsHomeHero } = await import("./docs-home");

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

describe("DocsHomeSection", () => {
  it("gives its heading the id a card grid below it names itself by", async () => {
    const { DocsHomeSection } = await import("./docs-home");
    const markup = renderToStaticMarkup(
      <DocsHomeSection id="pick-your-stack" title="Pick your stack">
        <p>cards</p>
      </DocsHomeSection>,
    );
    const heading = new DOMParser().parseFromString(markup, "text/html").querySelector("h2");
    expect(heading?.id).toBe("pick-your-stack");
    expect(heading?.textContent).toBe("Pick your stack");
  });
});
