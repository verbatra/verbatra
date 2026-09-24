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
