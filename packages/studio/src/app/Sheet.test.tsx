// @vitest-environment jsdom
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Sheet, type SheetSide } from "./Sheet.js";
import { click, render } from "./test-support.js";
import { microLabelClassName } from "./ui.js";

const REQUIRED = {
  title: "app.title",
  ariaLabel: "Key detail",
  closeLabel: "Close the key detail",
} as const;

describe("Sheet", () => {
  it("renders a named modal dialog holding the title and the content", () => {
    const view = render(
      <Sheet {...REQUIRED} onClose={() => {}} containerRef={createRef<HTMLDivElement>()}>
        <p>Body</p>
      </Sheet>,
    );
    const dialog = view.get("[role='dialog']");

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Key detail");
    expect(view.get("h2").textContent).toBe("app.title");
    expect(view.getByText("p", "Body")).not.toBeNull();
  });

  it("anchors to the inline-end edge by default", () => {
    const view = render(
      <Sheet {...REQUIRED} onClose={() => {}} containerRef={createRef<HTMLDivElement>()}>
        <p>Body</p>
      </Sheet>,
    );

    expect(view.get("div").classList.contains("justify-end")).toBe(true);
    expect(view.get("[role='dialog']").classList.contains("border-s")).toBe(true);
  });

  it.each([
    ["start", "justify-start", "border-e"],
    ["end", "justify-end", "border-s"],
    ["top", "items-start", "border-b"],
    ["bottom", "items-end", "border-t"],
  ] as ReadonlyArray<readonly [SheetSide, string, string]>)(
    "anchors the %s side with its own alignment and border edge",
    (side, alignment, border) => {
      const view = render(
        <Sheet
          {...REQUIRED}
          side={side}
          onClose={() => {}}
          containerRef={createRef<HTMLDivElement>()}
        >
          <p>Body</p>
        </Sheet>,
      );

      expect(view.get("div").classList.contains(alignment)).toBe(true);
      expect(view.get("[role='dialog']").classList.contains(border)).toBe(true);
    },
  );

  it("renders the kicker as a micro-label above the title when one is given", () => {
    const view = render(
      <Sheet
        {...REQUIRED}
        kicker="Translation key"
        onClose={() => {}}
        containerRef={createRef<HTMLDivElement>()}
      >
        <p>Body</p>
      </Sheet>,
    );
    const kicker = view.getByText("p", "Translation key");

    expect(kicker.className).toContain(microLabelClassName);
  });

  it("renders no kicker when none is given", () => {
    const view = render(
      <Sheet {...REQUIRED} onClose={() => {}} containerRef={createRef<HTMLDivElement>()}>
        <span>Body</span>
      </Sheet>,
    );

    expect(view.query("p")).toBeNull();
  });

  it("names the backdrop with the caller's close label, so the outside-click target reads clearly", () => {
    const view = render(
      <Sheet {...REQUIRED} onClose={() => {}} containerRef={createRef<HTMLDivElement>()}>
        <p>Body</p>
      </Sheet>,
    );

    expect(view.all("button")[0]?.getAttribute("aria-label")).toBe("Close the key detail");
  });

  it("dismisses when the backdrop behind the panel is activated", () => {
    const onClose = vi.fn();
    const view = render(
      <Sheet {...REQUIRED} onClose={onClose} containerRef={createRef<HTMLDivElement>()}>
        <p>Body</p>
      </Sheet>,
    );

    click(view.get("button[aria-label='Close the key detail']"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dismisses from the header close button, which keeps the generic Close name", () => {
    const onClose = vi.fn();
    const view = render(
      <Sheet {...REQUIRED} onClose={onClose} containerRef={createRef<HTMLDivElement>()}>
        <p>Body</p>
      </Sheet>,
    );

    click(view.get("button[aria-label='Close']"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("hands the panel element to the caller's ref, which is where the focus trap attaches", () => {
    const containerRef = createRef<HTMLDivElement>();
    const view = render(
      <Sheet {...REQUIRED} onClose={() => {}} containerRef={containerRef}>
        <p>Body</p>
      </Sheet>,
    );

    expect(containerRef.current).toBe(view.get("[role='dialog']"));
  });

  it("keeps the default width unless asked to be wide", () => {
    const narrow = render(
      <Sheet {...REQUIRED} onClose={() => {}} containerRef={createRef<HTMLDivElement>()}>
        <p>Body</p>
      </Sheet>,
    );
    const wide = render(
      <Sheet
        {...REQUIRED}
        size="wide"
        onClose={() => {}}
        containerRef={createRef<HTMLDivElement>()}
      >
        <p>Body</p>
      </Sheet>,
    );

    expect(narrow.get("[role='dialog']").className).toContain("w-[min(480px,100%)]");
    expect(wide.get("[role='dialog']").className).toContain("w-[min(960px,100%)]");
    expect(wide.get("[role='dialog']").className).not.toContain("w-[min(480px,100%)]");
  });
});
