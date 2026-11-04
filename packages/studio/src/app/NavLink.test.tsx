// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NavLink, type NavLinkProps } from "./NavLink.js";
import { installRouteGuard } from "./route-guard.js";
import { render } from "./test-support.js";

function mount(overrides: Partial<NavLinkProps> = {}): ReturnType<typeof render> {
  return render(
    <NavLink page="review" label="Review" active={false} variant="header" {...overrides} />,
  );
}

function clickWith(link: HTMLElement, init: MouseEventInit): MouseEvent {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  act(() => {
    link.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  window.history.replaceState(null, "", "#/translations");
});

describe("NavLink", () => {
  it("points at the page hash so it can be opened in a new tab", () => {
    expect(mount().get("a").getAttribute("href")).toBe("#/review");
  });

  it("marks only the active link as the current page", () => {
    expect(mount({ active: true }).get("a").getAttribute("aria-current")).toBe("page");
    expect(mount({ active: false }).query("a[aria-current]")).toBeNull();
  });

  it("navigates on a plain click and reports it to the caller", () => {
    const onNavigate = vi.fn();
    const view = mount({ onNavigate });

    const event = clickWith(view.get("a"), {});

    expect(event.defaultPrevented).toBe(true);
    expect(window.location.hash).toBe("#/review");
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("keeps the filters of the page it is already on", () => {
    window.history.replaceState(null, "", "#/review?locale=de");
    const view = mount({ active: true });

    clickWith(view.get("a"), {});

    expect(window.location.hash).toBe("#/review?locale=de");
  });

  it.each([
    ["ctrl", { ctrlKey: true }],
    ["meta", { metaKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
    ["middle button", { button: 1 }],
  ])("leaves a %s click to the browser", (_name, init) => {
    const onNavigate = vi.fn();
    const view = mount({ onNavigate });
    view.get("a").addEventListener("click", (event) => event.preventDefault());

    clickWith(view.get("a"), init);

    expect(window.location.hash).toBe("#/translations");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("shows a count chip and an accessible suffix for entries waiting", () => {
    const view = mount({ count: 3 });

    expect(view.get("a").textContent).toBe("Review3, 3 waiting");
  });

  it("caps an enormous count at 99+", () => {
    expect(mount({ count: 250 }).get("a").textContent).toContain("99+");
  });

  it.each([0, undefined])("renders no chip for a count of %s", (count) => {
    expect(mount({ count }).get("a").textContent).toBe("Review");
  });

  it("draws the page glyph when given one", () => {
    expect(mount({ icon: "review", variant: "drawer" }).get("a svg")).not.toBeNull();
  });

  it("stays put and does not report a navigation while unsaved edits hold the route", () => {
    const onNavigate = vi.fn();
    const release = installRouteGuard({ isDirty: () => true, onBlock: () => {} });
    const view = mount({ onNavigate });

    clickWith(view.get("a"), {});
    release();

    expect(window.location.hash).toBe("#/translations");
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
