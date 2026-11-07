// @vitest-environment jsdom
import { type ReactNode, useRef } from "react";
import { describe, expect, it } from "vitest";
import { render } from "./test-support.js";
import { useBannerAnchor } from "./use-banner-anchor.js";

let scroller: HTMLDivElement | null = null;
let headerHeight = 50;

function Host({ shown }: { readonly shown: boolean }): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  useBannerAnchor(ref, shown);
  return (
    <div
      ref={(node) => {
        ref.current = node;
        scroller = node;
      }}
    >
      <div
        data-sticky=""
        ref={(node) => {
          if (node !== null) {
            Object.defineProperty(node, "offsetHeight", {
              configurable: true,
              get: () => headerHeight,
            });
          }
        }}
      />
    </div>
  );
}

describe("useBannerAnchor", () => {
  it("scrolls by what a banner added to the sticky header, and back when it goes", () => {
    headerHeight = 50;
    const view = render(<Host shown={false} />);
    (scroller as HTMLDivElement).scrollTop = 300;

    headerHeight = 156;
    view.rerender(<Host shown />);
    expect((scroller as HTMLDivElement).scrollTop).toBe(406);

    headerHeight = 50;
    view.rerender(<Host shown={false} />);
    expect((scroller as HTMLDivElement).scrollTop).toBe(300);
  });

  it("switches off the browser's own anchoring so the two never add up", () => {
    headerHeight = 50;
    render(<Host shown={false} />);

    expect((scroller as HTMLDivElement).style.overflowAnchor).toBe("none");
  });

  it("does not move on the first render", () => {
    headerHeight = 50;
    render(<Host shown={false} />);

    expect((scroller as HTMLDivElement).scrollTop).toBe(0);
  });
});
