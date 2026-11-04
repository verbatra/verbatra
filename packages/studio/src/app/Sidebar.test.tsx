// @vitest-environment jsdom

import type { IconName } from "@verbatra/ui";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PageId } from "../client/routes.js";
import { NAV_GROUPS } from "./nav-groups.js";
import { DesktopSidebar, MobileNavDrawer, type SidebarNavProps } from "./Sidebar.js";
import { click, pressKey, type RenderResult, render } from "./test-support.js";

const PAGE_LABELS: Readonly<Record<PageId, string>> = {
  overview: "Overview",
  translations: "Translations",
  review: "Review",
  glossary: "Glossary",
  settings: "Settings",
};

const PAGE_ICONS: Readonly<Record<PageId, IconName>> = {
  overview: "activity",
  translations: "diff",
  review: "review",
  glossary: "book",
  settings: "settings",
};

function navProps(overrides: Partial<SidebarNavProps> = {}): SidebarNavProps {
  return {
    groups: NAV_GROUPS,
    pageLabels: PAGE_LABELS,
    pageIcons: PAGE_ICONS,
    activePage: "translations",
    onSelectPage: () => {},
    ...overrides,
  };
}

function renderDesktop(
  options: {
    readonly collapsed?: boolean;
    readonly onToggleCollapsed?: () => void;
    readonly nav?: Partial<SidebarNavProps>;
  } = {},
): RenderResult {
  return render(
    <DesktopSidebar
      {...navProps(options.nav)}
      collapsed={options.collapsed ?? false}
      onToggleCollapsed={options.onToggleCollapsed ?? (() => {})}
    />,
  );
}

function renderDrawer(
  options: { readonly onClose?: () => void; readonly nav?: Partial<SidebarNavProps> } = {},
): RenderResult {
  return render(
    <MobileNavDrawer {...navProps(options.nav)} onClose={options.onClose ?? (() => {})} />,
  );
}

describe("DesktopSidebar", () => {
  it("groups the nav into a named Workspace zone and a named Project zone", () => {
    const view = renderDesktop();

    expect(view.get('nav[aria-label="Workspace"]')).not.toBeNull();
    expect(view.get('nav[aria-label="Project"]')).not.toBeNull();
  });

  it("lists each zone's pages in the order the caller gave them", () => {
    const view = renderDesktop();
    const workspace = view.get('nav[aria-label="Workspace"]');

    expect([...workspace.querySelectorAll("button")].map((item) => item.textContent)).toEqual([
      "Overview",
      "Translations",
      "Review",
    ]);
  });

  it("shows each zone's own label above its items while expanded", () => {
    const view = renderDesktop();

    expect(view.getByText("p", "Workspace")).not.toBeNull();
    expect(view.getByText("p", "Project")).not.toBeNull();
  });

  it("drops the zone labels from the collapsed rail, where there is no room for them", () => {
    const view = renderDesktop({ collapsed: true });

    expect(view.all("p")).toHaveLength(0);
  });

  it("marks the active page as the current one for assistive technology", () => {
    const view = renderDesktop({ nav: { activePage: "settings" } });
    const current = view.all('[aria-current="page"]');

    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe("Settings");
  });

  it("reports the selected page to the caller", () => {
    const onSelectPage = vi.fn();
    const view = renderDesktop({ nav: { onSelectPage } });

    click(view.getByText("button", "Glossary"));

    expect(onSelectPage).toHaveBeenCalledWith("glossary");
  });

  it("shows the product wordmark while expanded", () => {
    const view = renderDesktop();

    expect(view.text()).toContain("Verbatra");
    expect(view.text()).toContain("Localization Studio");
  });

  it("reduces the brand to its mark alone on the collapsed rail", () => {
    const view = renderDesktop({ collapsed: true });

    expect(view.text()).not.toContain("Localization Studio");
  });

  it("keeps the page name out of the collapsed item's text but inside its accessible name", () => {
    const view = renderDesktop({ collapsed: true });
    const review = view.get('button[aria-label="Review"]');

    expect(review.textContent).toBe("");
  });

  it("renders a count chip and an accessible suffix for a page with entries waiting", () => {
    const view = renderDesktop({ nav: { pageBadges: { review: 7 } } });
    const review = view.getByText("button", "Review7, 7 waiting");

    expect(review.querySelector('span[aria-hidden="true"]')?.textContent).toBe("7");
    expect(review.querySelector(".sr-only")?.textContent).toBe(", 7 waiting");
  });

  it("folds the count into the collapsed item's accessible name, since its label is hidden", () => {
    const view = renderDesktop({ collapsed: true, nav: { pageBadges: { review: 7 } } });

    expect(view.get('button[aria-label="Review, 7 waiting"]').textContent).toBe("7");
  });

  it("caps an enormous queue at 99+ so the chip cannot stretch the rail", () => {
    const view = renderDesktop({ nav: { pageBadges: { review: 240 } } });

    expect(view.getByText("span", "99+")).not.toBeNull();
  });

  it("renders no chip for a page whose count is zero", () => {
    const view = renderDesktop({ nav: { pageBadges: { review: 0 } } });

    expect(view.getByText("button", "Review")).not.toBeNull();
  });

  it("renders no chip for a page with no count at all", () => {
    const view = renderDesktop({ nav: { pageBadges: {} } });

    expect(view.getByText("button", "Review")).not.toBeNull();
  });

  it("offers the documentation and issue links in a named help nav, opened in a new tab", () => {
    const view = renderDesktop();
    const help = view.get('nav[aria-label="Help"]');
    const links = [...help.querySelectorAll("a")];

    expect(links.map((link) => link.textContent)).toEqual(["Documentation", "Help and issues"]);
    expect(links.every((link) => link.getAttribute("target") === "_blank")).toBe(true);
    expect(links.every((link) => link.getAttribute("rel") === "noreferrer")).toBe(true);
  });

  it("names the collapsed help links, which render as glyphs only", () => {
    const view = renderDesktop({ collapsed: true });
    const links = [...view.get('nav[aria-label="Help"]').querySelectorAll("a")];

    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "Documentation",
      "Help and issues",
    ]);
    expect(links.every((link) => link.textContent === "")).toBe(true);
  });

  it("offers a collapse control that reports the rail as currently expanded", () => {
    const view = renderDesktop();
    const toggle = view.get('[aria-label="Collapse sidebar"]');

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe("Collapse");
  });

  it("offers an expand control that reports the rail as currently collapsed", () => {
    const view = renderDesktop({ collapsed: true });
    const toggle = view.get('[aria-label="Expand sidebar"]');

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toBe("");
  });

  it("asks the caller to flip the collapsed state, which it does not own itself", () => {
    const onToggleCollapsed = vi.fn();
    const view = renderDesktop({ onToggleCollapsed });

    click(view.get('[aria-label="Collapse sidebar"]'));

    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it("marks the active item with the accent treatment the rail uses for it", () => {
    const expanded = renderDesktop({ nav: { activePage: "review" } });
    const collapsed = renderDesktop({ collapsed: true, nav: { activePage: "review" } });

    expect(expanded.get('[aria-current="page"]').className).toContain("before:bg-sidebar-active");
    expect(collapsed.get('[aria-current="page"]').className).not.toContain(
      "before:bg-sidebar-active",
    );
    expect(collapsed.get('[aria-current="page"]').className).toContain("bg-sidebar-accent");
  });

  it("shows each collapsed item's name in a tooltip without announcing it twice", () => {
    const view = renderDesktop({ collapsed: true });
    const bubble = view.getByText('[role="tooltip"]', "Review");
    const control = bubble.closest("[data-slot]")?.previousElementSibling;

    expect(bubble.getAttribute("aria-hidden")).toBe("true");
    expect(control?.getAttribute("aria-label")).toContain("Review");
    expect(control?.hasAttribute("aria-describedby")).toBe(false);
  });
});

const DIALOG_CLOSE = '[role="dialog"] [aria-label="Close navigation"]';

describe("MobileNavDrawer", () => {
  it("presents itself as a named modal dialog", () => {
    const view = renderDrawer();
    const dialog = view.get('[role="dialog"]');

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Navigation");
  });

  it("carries the same two nav zones as the rail, always expanded", () => {
    const view = renderDrawer();

    expect(view.get('nav[aria-label="Workspace"]')).not.toBeNull();
    expect(view.get('nav[aria-label="Project"]')).not.toBeNull();
    expect(view.getByText("button", "Translations")).not.toBeNull();
  });

  it("shows the full wordmark, since the drawer is never the collapsed rail", () => {
    const view = renderDrawer();

    expect(view.text()).toContain("Localization Studio");
  });

  it("reports the selected page without closing itself, which is the caller's job", () => {
    const onSelectPage = vi.fn();
    const onClose = vi.fn();
    const view = renderDrawer({ onClose, nav: { onSelectPage } });

    click(view.getByText("button", "Review"));

    expect(onSelectPage).toHaveBeenCalledWith("review");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes from the explicit close button next to the brand", () => {
    const onClose = vi.fn();
    const view = renderDrawer({ onClose });

    click(view.get(DIALOG_CLOSE));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop behind the panel is clicked", () => {
    const onClose = vi.fn();
    const view = renderDrawer({ onClose });

    click(view.all('[aria-label="Close navigation"]')[0] as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderDrawer({ onClose });

    pressKey("Escape");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the drawer on open, so the keyboard lands inside it", () => {
    const view = renderDrawer();

    expect(document.activeElement).toBe(view.get(DIALOG_CLOSE));
  });

  it("wraps focus back to the first control when Tab leaves the last one", () => {
    const view = renderDrawer();
    const focusable = view.all('[role="dialog"] button, [role="dialog"] a[href]');
    const last = focusable[focusable.length - 1];
    act(() => {
      last?.focus();
    });

    pressKey("Tab");

    expect(document.activeElement).toBe(view.get(DIALOG_CLOSE));
  });

  it("shows a count chip on a drawer entry with entries waiting", () => {
    const view = renderDrawer({ nav: { pageBadges: { review: 3 } } });

    expect(view.getByText("button", "Review3, 3 waiting")).not.toBeNull();
  });
});
