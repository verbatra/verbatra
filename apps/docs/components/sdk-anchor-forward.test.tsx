// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SdkAnchorForwarder } from "./sdk-anchor-forward";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const replace = vi.fn();
const router = { replace };

vi.mock("next/navigation", () => ({ useRouter: () => router }));

const TARGETS = { translateProject: "/docs/sdk/run", errorHint: "/docs/sdk/errors" };

let mounted: { container: HTMLDivElement; root: Root } | undefined;

function render(): void {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<SdkAnchorForwarder targets={TARGETS} />);
  });
  mounted = { container, root };
}

function unmount(): void {
  if (!mounted) return;
  const { container, root } = mounted;
  mounted = undefined;
  act(() => {
    root.unmount();
  });
  container.remove();
}

function navigateToHash(hash: string): void {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

beforeEach(() => {
  replace.mockClear();
  window.location.hash = "";
});

afterEach(() => {
  unmount();
  vi.restoreAllMocks();
});

describe("SdkAnchorForwarder", () => {
  it("forwards a moved anchor on mount", () => {
    window.location.hash = "#translateProject";

    render();

    expect(replace).toHaveBeenCalledWith("/docs/sdk/run#translateProject");
  });

  it("leaves an anchor alone that the page still heads", () => {
    const heading = document.createElement("h2");
    heading.id = "translateProject";
    document.body.append(heading);
    window.location.hash = "#translateProject";

    render();
    heading.remove();

    expect(replace).not.toHaveBeenCalled();
  });

  it("does nothing without a hash or for an unknown anchor", () => {
    render();
    navigateToHash("#somethingElse");

    expect(replace).not.toHaveBeenCalled();
  });

  it("forwards on a later hash change", () => {
    render();

    navigateToHash("#errorHint");

    expect(replace).toHaveBeenCalledWith("/docs/sdk/errors#errorHint");
  });

  it("removes its hashchange listener on unmount", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    render();

    unmount();
    navigateToHash("#errorHint");

    expect(remove).toHaveBeenCalledWith("hashchange", expect.any(Function));
    expect(replace).not.toHaveBeenCalled();
  });
});
