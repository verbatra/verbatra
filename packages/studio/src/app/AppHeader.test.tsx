// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader, type AppHeaderProps } from "./AppHeader.js";
import { type RenderResult, render } from "./test-support.js";

vi.stubGlobal("matchMedia", () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

function mount(overrides: Partial<AppHeaderProps> = {}): RenderResult {
  return render(
    <AppHeader activePage="translations" pageBadges={{}} onOpenMenu={() => {}} {...overrides} />,
  );
}

describe("AppHeader", () => {
  it("names the product in a home link to the workspace", () => {
    const view = mount();

    expect(view.get("header > div > a").getAttribute("href")).toBe("#/translations");
    expect(view.text()).toContain("verbatra");
    expect(view.text()).toContain("Studio");
  });

  it("lists the five pages in workspace-then-project order in one named nav", () => {
    const labels = mount()
      .all('nav[aria-label="Studio"] a')
      .map((link) => link.textContent);

    expect(labels).toEqual(["Overview", "Translations", "Review", "Glossary", "Settings"]);
  });

  it("marks the active page as current and no other", () => {
    const view = mount({ activePage: "review" });

    expect(view.all('nav[aria-label="Studio"] [aria-current="page"]')).toHaveLength(1);
    expect(view.get('nav[aria-label="Studio"] [aria-current="page"]').textContent).toBe("Review");
  });

  it("shows the review count", () => {
    const view = mount({ pageBadges: { review: 4 } });

    expect(view.get("nav").textContent).toContain("4, 4 waiting");
  });

  it("offers a key search", () => {
    expect(mount().get('search input[aria-label="Search keys and translations"]')).not.toBeNull();
  });

  it("links the documentation and GitHub in new tabs with names that say so", () => {
    const view = mount();
    const docs = view.get('a[aria-label="Documentation (opens in a new tab)"]');
    const github = view.get('a[aria-label="GitHub (opens in a new tab)"]');

    expect(docs.getAttribute("href")).toBe("https://verbatra.kreitz-webdev.de");
    expect(github.getAttribute("href")).toBe("https://github.com/verbatra/verbatra");
    expect([docs, github].every((link) => link.getAttribute("target") === "_blank")).toBe(true);
  });

  it("offers the theme toggle, named with the current mode and the next action", () => {
    expect(mount().get('[aria-label="Theme: System. Switch to Light."]')).not.toBeNull();
  });

  it("announces each theme the toggle switches to", () => {
    const view = mount();
    const region = view.all('[role="status"]').at(-1);

    act(() => {
      view.get("[data-theme-toggle]").click();
    });
    expect(region?.textContent).toBe("Theme set to Light");

    act(() => {
      view.get("[data-theme-toggle]").click();
    });
    expect(region?.textContent).toBe("Theme set to Dark");
  });

  it("opens the menu from a named button", () => {
    const onOpenMenu = vi.fn();
    const view = mount({ onOpenMenu });

    act(() => {
      view.get('[aria-label="Open navigation"]').click();
    });

    expect(onOpenMenu).toHaveBeenCalledTimes(1);
  });

  it("carries the live connection region", () => {
    expect(mount().get('[role="status"]')).not.toBeNull();
  });
});
