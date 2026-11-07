// @vitest-environment jsdom
import { type ReactNode, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "./test-support.js";
import { useRevealEdit } from "./use-reveal-edit.js";

const scrolled = vi.fn();
const original = Element.prototype.scrollIntoView;

afterEach(() => {
  Element.prototype.scrollIntoView = original;
  scrolled.mockReset();
});

function Host({
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

    const view = render(<Host active locale="fr" />);

    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.instances[0]).toBe(view.get('[data-locale="fr"]'));
    expect(view.get('[data-locale="fr"]').style.scrollMarginTop).toBe("8px");
    expect(document.activeElement).toBe(before);
  });

  it("does nothing while inactive, without a locale or for a locale with no block", () => {
    Element.prototype.scrollIntoView = scrolled;

    render(<Host active={false} locale="de" />);
    render(<Host active locale={null} />);
    render(<Host active locale="xx" />);

    expect(scrolled).not.toHaveBeenCalled();
  });
});
