// @vitest-environment jsdom
import { type ReactNode, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "./test-support.js";
import { useBannerAnchor, useRevealEdit } from "./use-banner-anchor.js";

let scroller: HTMLDivElement | null = null;
let rowTop = 300;
const stickyBottom = 56;
let nextTop: number | undefined;

function Host({
  shown,
  withRow = true,
}: {
  readonly shown: boolean;
  readonly withRow?: boolean;
}): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  useBannerAnchor(ref, shown);
  return (
    <div
      ref={(node) => {
        ref.current = node;
        scroller = node;
        if (node !== null) {
          node.getBoundingClientRect = () => ({ top: 0, bottom: 800 }) as DOMRect;
        }
      }}
    >
      <i
        ref={() => {
          if (nextTop !== undefined) {
            rowTop = nextTop;
            nextTop = undefined;
          }
        }}
      />
      <div
        data-sticky=""
        ref={(node) => {
          if (node !== null) {
            node.getBoundingClientRect = () => ({ top: 0, bottom: stickyBottom }) as DOMRect;
          }
        }}
      />
      {withRow ? (
        <div
          data-revision="a"
          ref={(node) => {
            if (node !== null) {
              node.getBoundingClientRect = () => ({ top: rowTop, bottom: rowTop + 100 }) as DOMRect;
            }
          }}
        />
      ) : null}
    </div>
  );
}

describe("useBannerAnchor", () => {
  it("moves the scroll by how far the first visible row shifted, whichever way the layout moved", () => {
    rowTop = 300;
    const view = render(<Host shown={false} />);
    const node = scroller as HTMLDivElement;
    node.scrollTop = 300;

    nextTop = 406;
    view.rerender(<Host shown />);
    expect(node.scrollTop).toBe(406);

    nextTop = 300;
    view.rerender(<Host shown={false} />);
    expect(node.scrollTop).toBe(300);
  });

  it("does not count a clamped scroll twice when the banner goes and the content shrinks", () => {
    rowTop = 300;
    const view = render(<Host shown />);
    (scroller as HTMLDivElement).scrollTop = 500;

    nextTop = 300;
    view.rerender(<Host shown={false} />);

    expect((scroller as HTMLDivElement).scrollTop).toBe(500);
  });

  it("switches off the browser's own anchoring so the two never add up", () => {
    render(<Host shown={false} />);

    expect((scroller as HTMLDivElement).style.overflowAnchor).toBe("none");
  });

  it("does nothing on the first render or when no row is on screen", () => {
    render(<Host shown={false} withRow={false} />);

    expect((scroller as HTMLDivElement).scrollTop).toBe(0);
  });

  it("does nothing when the banner state did not change", () => {
    rowTop = 300;
    const view = render(<Host shown={false} />);
    (scroller as HTMLDivElement).scrollTop = 120;

    rowTop = 999;
    view.rerender(<Host shown={false} />);

    expect((scroller as HTMLDivElement).scrollTop).toBe(120);
  });
});

const scrolled = vi.fn();
const original = Element.prototype.scrollIntoView;

afterEach(() => {
  Element.prototype.scrollIntoView = original;
  scrolled.mockReset();
});

function RevealHost({
  active,
  locale,
}: {
  readonly active: boolean;
  readonly locale: string | null;
}): ReactNode {
  const ref = useRef<HTMLUListElement | null>(null);
  useRevealEdit(ref, active, locale);
  return (
    <div role="dialog">
      <div data-sticky="" />
      <ul ref={ref}>
        <li data-locale="de" />
        <li data-locale="fr" />
      </ul>
    </div>
  );
}

describe("useRevealEdit", () => {
  it("brings the edited locale into view when asked, clear of the sticky header, and moves no focus", () => {
    Element.prototype.scrollIntoView = scrolled;
    const before = document.activeElement;

    const view = render(<RevealHost active locale="fr" />);

    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.instances[0]).toBe(view.get('[data-locale="fr"]'));
    expect(view.get('[data-locale="fr"]').style.scrollMarginTop).toBe("8px");
    expect(document.activeElement).toBe(before);
  });

  it("does nothing while inactive, without a locale or for a locale with no block", () => {
    Element.prototype.scrollIntoView = scrolled;

    render(<RevealHost active={false} locale="de" />);
    render(<RevealHost active locale={null} />);
    render(<RevealHost active locale="xx" />);

    expect(scrolled).not.toHaveBeenCalled();
  });
});
