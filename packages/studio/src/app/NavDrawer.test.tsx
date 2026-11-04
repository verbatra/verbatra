// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NavDrawer, type NavDrawerProps } from "./NavDrawer.js";
import { click, pressKey, type RenderResult, render } from "./test-support.js";

const DIALOG_CLOSE = '[role="dialog"] [aria-label="Close navigation"]';

function mount(overrides: Partial<NavDrawerProps> = {}): RenderResult {
  return render(
    <NavDrawer activePage="translations" pageBadges={{}} onClose={() => {}} {...overrides} />,
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "#/translations");
});

describe("NavDrawer", () => {
  it("presents itself as a named modal dialog", () => {
    const dialog = mount().get('[role="dialog"]');

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Navigation");
  });

  it("lists every page in the Workspace and Project groups", () => {
    const view = mount();
    const labels = (group: string) =>
      view.all(`nav[aria-label="${group}"] a`).map((link) => link.textContent);

    expect(labels("Workspace")).toEqual(["Overview", "Translations", "Review"]);
    expect(labels("Project")).toEqual(["Glossary", "Settings"]);
  });

  it("marks the active page as current", () => {
    const view = mount({ activePage: "glossary" });

    expect(view.get('[aria-current="page"]').textContent).toBe("Glossary");
  });

  it("offers the documentation and GitHub in a help nav, opened in a new tab", () => {
    const links = mount().all('nav[aria-label="Help"] a');

    expect(links.map((link) => link.textContent)).toEqual(["Documentation", "GitHub"]);
    expect(links.every((link) => link.getAttribute("target") === "_blank")).toBe(true);
    expect(links.every((link) => link.getAttribute("rel") === "noreferrer")).toBe(true);
  });

  it("shows the waiting count on the review entry", () => {
    const view = mount({ pageBadges: { review: 3 } });

    expect(view.getByText("nav a", "Review3, 3 waiting")).not.toBeNull();
  });

  it("navigates and closes when a page is chosen", () => {
    const onClose = vi.fn();
    const view = mount({ onClose });

    click(view.getByText("nav a", "Settings"));

    expect(window.location.hash).toBe("#/settings");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("searches and closes", () => {
    const onClose = vi.fn();
    const view = mount({ onClose });

    act(() => {
      view.get("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(window.location.hash).toBe("#/translations");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from the close button", () => {
    const onClose = vi.fn();
    const view = mount({ onClose });

    click(view.get(DIALOG_CLOSE));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked", () => {
    const onClose = vi.fn();
    const view = mount({ onClose });

    click(view.get("[data-backdrop]"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    mount({ onClose });

    pressKey("Escape");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the drawer on open", () => {
    const view = mount();

    expect(view.get('[role="dialog"]').contains(document.activeElement)).toBe(true);
  });

  it("wraps focus from the last control back to the first on Tab", () => {
    const view = mount();
    const focusable = view.all(
      '[role="dialog"] button, [role="dialog"] a[href], [role="dialog"] input',
    );
    const first = focusable[0];
    act(() => {
      focusable[focusable.length - 1]?.focus();
    });

    pressKey("Tab");

    expect(document.activeElement).toBe(first);
  });

  it("wraps focus from the first control to the last on Shift+Tab", () => {
    const view = mount();
    const focusable = view.all(
      '[role="dialog"] button, [role="dialog"] a[href], [role="dialog"] input',
    );
    act(() => {
      focusable[0]?.focus();
    });

    pressKey("Tab", { shiftKey: true });

    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
  });
});
