// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markLinkNavigation, useScrollToTopOnLinkNavigation } from "./link-scroll.js";
import { restoreHeldRoute } from "./route-guard.js";
import { flush, render } from "./test-support.js";
import { useRoute } from "./use-route.js";

const scrollTo = vi.fn();

function Host(): ReactNode {
  const route = useRoute();
  useScrollToTopOnLinkNavigation(route);
  return <span>{route.page}</span>;
}

async function goTo(hash: string): Promise<void> {
  await act(async () => {
    window.location.hash = hash;
  });
  await flush();
}

function anchorTo(href: string, attributes: Readonly<Record<string, string>> = {}): HTMLElement {
  const anchor = document.createElement("a");
  anchor.setAttribute("href", href);
  for (const [name, value] of Object.entries(attributes)) {
    anchor.setAttribute(name, value);
  }
  document.body.append(anchor);
  return anchor;
}

async function click(anchor: HTMLElement, init: MouseEventInit = {}): Promise<void> {
  await act(async () => {
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
  });
  await flush();
  anchor.remove();
}

beforeEach(() => {
  scrollTo.mockClear();
  vi.stubGlobal("scrollTo", scrollTo);
  window.history.replaceState(null, "", "#/glossary");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useScrollToTopOnLinkNavigation", () => {
  it("scrolls to the top when the route lands on the marked target", async () => {
    render(<Host />);

    markLinkNavigation("#/review?locale=de");
    await goTo("#/review?locale=de");

    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("treats an alias of the marked page as the same route", async () => {
    render(<Host />);

    markLinkNavigation("#/activity");
    await goTo("#/overview");

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("does not scroll when the route lands somewhere else, and forgets the mark", async () => {
    render(<Host />);

    markLinkNavigation("#/review");
    await goTo("#/settings");
    await goTo("#/review");

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not scroll without a mark, as on back, forward or a replace", async () => {
    render(<Host />);

    await goTo("#/review");

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("keeps a mark for as long as the navigation takes, however slowly the page renders", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    render(<Host />);

    markLinkNavigation("#/review");
    vi.setSystemTime(Date.now() + 600_000);
    await goTo("#/review");

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("drops the mark when the hold that kept the navigation is dropped", async () => {
    render(<Host />);

    markLinkNavigation("#/review");
    restoreHeldRoute();
    await goTo("#/review");

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("marks a plain click on an in-app link", async () => {
    render(<Host />);

    await act(async () => {
      anchorTo("#/review").click();
    });
    await flush();

    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a modified click", "#/review", {}, { ctrlKey: true }],
    ["a meta click", "#/review", {}, { metaKey: true }],
    ["a shift click", "#/review", {}, { shiftKey: true }],
    ["an alt click", "#/review", {}, { altKey: true }],
    ["a middle click", "#/review", {}, { button: 1 }],
    ["a link that opens a new tab", "#/review", { target: "_blank" }, {}],
  ])("does not mark %s", async (_name, href, attributes, init) => {
    render(<Host />);

    await click(anchorTo(href, attributes), init);
    await goTo(href);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not mark a link whose default action was already prevented", async () => {
    render(<Host />);
    const anchor = anchorTo("#/review");
    anchor.addEventListener("click", (event) => event.preventDefault());

    await click(anchor);
    await goTo("#/review");

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("does not mark a link that leaves the app routes", async () => {
    render(<Host />);

    await click(anchorTo("https://example.com/#/review"));
    await goTo("#/review");

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("stops listening for clicks once the host unmounts", async () => {
    const view = render(<Host />);
    view.unmount();

    await click(anchorTo("#/review"));

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
