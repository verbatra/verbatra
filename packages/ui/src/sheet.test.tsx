// @vitest-environment jsdom
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  DialogCloseButton,
  DrawerShell,
  OverlayBackdrop,
  Sheet,
  type SheetSide,
} from "./sheet.tsx";
import { click, render } from "./test-support.tsx";

const REQUIRED = {
  title: "app.title",
  ariaLabel: "Key detail",
  closeLabel: "Close the key detail",
} as const;

function sheet(props: Partial<Parameters<typeof Sheet>[0]> = {}) {
  return render(
    <Sheet {...REQUIRED} onClose={() => {}} containerRef={createRef<HTMLDivElement>()} {...props}>
      <p>Body</p>
    </Sheet>,
  );
}

describe("OverlayBackdrop", () => {
  it("is a real, named button, so dismissing outside stays keyboard-operable", () => {
    const view = render(<OverlayBackdrop onClose={() => {}} label="Close the key detail" />);
    const backdrop = view.get("button");

    expect(backdrop.getAttribute("type")).toBe("button");
    expect(backdrop.getAttribute("aria-label")).toBe("Close the key detail");
  });

  it("calls onClose when clicked", () => {
    const onClose = vi.fn();
    const view = render(<OverlayBackdrop onClose={onClose} label="Close" />);

    click(view.get("button"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("DialogCloseButton", () => {
  it("is named Close by default and takes a more specific name", () => {
    expect(
      render(<DialogCloseButton onClose={() => {}} />)
        .get("button")
        .getAttribute("aria-label"),
    ).toBe("Close");
    expect(
      render(<DialogCloseButton onClose={() => {}} label="Close preview" />)
        .get("button")
        .getAttribute("aria-label"),
    ).toBe("Close preview");
  });

  it("calls onClose when pressed and draws a decorative glyph", () => {
    const onClose = vi.fn();
    const view = render(<DialogCloseButton onClose={onClose} />);

    click(view.get("button"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(view.get("svg").getAttribute("aria-hidden")).toBe("true");
  });

  it("uses compact spacing unless a caller replaces it", () => {
    const compact = render(<DialogCloseButton onClose={() => {}} />).get("button");
    const custom = render(<DialogCloseButton onClose={() => {}} className="p-3" />).get("button");

    expect(compact.className).toContain("p-1.5");
    expect(custom.className).toContain("p-3");
    expect(custom.className).not.toContain("p-1.5");
  });
});

describe("Sheet", () => {
  it("renders a named modal dialog holding the title and the content", () => {
    const view = sheet();
    const dialog = view.get("[role='dialog']");

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Key detail");
    expect(view.get("h2").textContent).toBe("app.title");
    expect(view.text()).toContain("Body");
  });

  it("anchors to the inline-end edge at the default width", () => {
    const view = sheet();

    expect(view.get("[data-side]").dataset.side).toBe("end");
    expect(view.get("[role='dialog']").dataset.size).toBe("default");
  });

  it.each(["start", "end", "top", "bottom"] as readonly SheetSide[])(
    "reports the %s side",
    (side) => {
      expect(sheet({ side }).get("[data-side]").dataset.side).toBe(side);
    },
  );

  it("reports the wide size", () => {
    expect(sheet({ size: "wide" }).get("[role='dialog']").dataset.size).toBe("wide");
  });

  it("renders the kicker above the title only when given", () => {
    expect(sheet({ kicker: "Key" }).text()).toContain("Key");
    expect(sheet().query("h2")?.previousElementSibling).toBeNull();
  });

  it("names the backdrop and dismisses from the backdrop and the header button", () => {
    const onClose = vi.fn();
    const view = sheet({ onClose });

    click(view.get("button[aria-label='Close the key detail']"));
    click(view.get("button[aria-label='Close']"));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("hands the panel element to the caller's ref, where a focus trap attaches", () => {
    const containerRef = createRef<HTMLDivElement>();
    const view = sheet({ containerRef });

    expect(containerRef.current).toBe(view.get("[role='dialog']"));
  });
});

describe("DrawerShell", () => {
  it("anchors a named dialog to the inline-end edge", () => {
    const view = render(
      <DrawerShell {...REQUIRED} onClose={() => {}} containerRef={createRef<HTMLDivElement>()}>
        <p>Body</p>
      </DrawerShell>,
    );

    expect(view.get("[data-side]").dataset.side).toBe("end");
    expect(view.get("[role='dialog']").getAttribute("aria-label")).toBe("Key detail");
  });
});
