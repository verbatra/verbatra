// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "./test-support.js";
import { useMediaQuery } from "./use-media-query.js";

function Probe({ fallback }: { readonly fallback: boolean }): ReactNode {
  return <span>{useMediaQuery("(min-width: 1024px)", fallback) ? "wide" : "narrow"}</span>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("useMediaQuery", () => {
  it("falls back when the browser cannot match media", () => {
    expect(render(<Probe fallback />).text()).toBe("wide");
    expect(render(<Probe fallback={false} />).text()).toBe("narrow");
  });

  it("follows the query as it starts and stops matching", () => {
    let listener: (() => void) | undefined;
    const list = {
      matches: false,
      addEventListener: (_type: string, next: () => void) => {
        listener = next;
      },
      removeEventListener: vi.fn(),
    };
    window.matchMedia = vi.fn(() => list) as unknown as typeof window.matchMedia;
    const view = render(<Probe fallback />);
    expect(view.text()).toBe("narrow");

    list.matches = true;
    act(() => listener?.());
    expect(view.text()).toBe("wide");

    view.unmount();
    expect(list.removeEventListener).toHaveBeenCalled();
  });
});
