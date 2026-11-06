// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pressKey, render } from "./test-support.tsx";
import { Tooltip } from "./tooltip.tsx";

function fire(target: Element, type: string): void {
  act(() => {
    target.dispatchEvent(new Event(type, { bubbles: type === "focusin" || type === "focusout" }));
  });
}

function hover(target: Element): void {
  act(() => {
    target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
}

function unhover(target: Element): void {
  act(() => {
    target.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
  });
}

function mount(props: { side?: "end" | "bottom"; disabled?: boolean } = {}) {
  return render(
    <Tooltip label="Copy the key" {...(props.side !== undefined ? { side: props.side } : {})}>
      <button type="button" disabled={props.disabled === true}>
        c
      </button>
    </Tooltip>,
  );
}

const SLOT = "[data-slot]";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Tooltip", () => {
  it("describes the control by the tooltip, so a screen reader announces it", () => {
    const view = mount();
    const bubble = view.get("[role='tooltip']");

    expect(bubble.textContent).toBe("Copy the key");
    expect(view.get("button").getAttribute("aria-describedby")).toBe(bubble.id);
    expect(view.query("[aria-hidden]")).toBeNull();
  });

  it("adds no description and hides the bubble when it only repeats what the control already says", () => {
    const view = render(
      <Tooltip label="In the review queue" decorative>
        <button type="button">key in de: Missing, In the review queue</button>
      </Tooltip>,
    );

    expect(view.get("button").hasAttribute("aria-describedby")).toBe(false);
    expect(view.get("[role='tooltip']").getAttribute("aria-hidden")).toBe("true");
    expect(view.get("[role='tooltip']").textContent).toBe("In the review queue");
  });

  it("keeps a describedby the control already has", () => {
    const view = render(
      <Tooltip label="Tip">
        <button type="button" aria-describedby="hint">
          c
        </button>
      </Tooltip>,
    );

    expect(view.get("button").getAttribute("aria-describedby")).toBe(
      `hint ${view.get("[role='tooltip']").id}`,
    );
  });

  it("starts closed", () => {
    expect(mount().get(SLOT).hasAttribute("data-open")).toBe(false);
  });

  it("describes the control while closed, so the description is ready before it opens", () => {
    const view = mount();

    expect(view.get(SLOT).hasAttribute("data-open")).toBe(false);
    expect(view.get("button").getAttribute("aria-describedby")).toBe(
      view.get("[role='tooltip']").id,
    );
  });

  describe("trigger focus", () => {
    function focusOnly() {
      const view = render(
        <Tooltip label="Tip" trigger="focus">
          <button type="button">c</button>
        </Tooltip>,
      );
      return { view, wrapper: view.get("button").parentElement as HTMLElement };
    }

    it("ignores the pointer", () => {
      const { view } = focusOnly();

      hover(view.get("button"));

      expect(view.get(SLOT).hasAttribute("data-open")).toBe(false);
    });

    it("opens when the focus is keyboard focus", () => {
      const { view, wrapper } = focusOnly();
      vi.spyOn(wrapper, "querySelector").mockReturnValue(view.get("button"));

      fire(view.get("button"), "focusin");

      expect(view.get(SLOT).hasAttribute("data-open")).toBe(true);
    });

    it("stays closed when a pointer press moved the focus, which is not focus-visible", () => {
      const { view, wrapper } = focusOnly();
      vi.spyOn(wrapper, "querySelector").mockReturnValue(null);

      fire(view.get("button"), "focusin");

      expect(view.get(SLOT).hasAttribute("data-open")).toBe(false);
    });

    it("treats a browser that cannot answer the focus-visible question as keyboard focus", () => {
      const { view, wrapper } = focusOnly();
      vi.spyOn(wrapper, "querySelector").mockImplementation(() => {
        throw new SyntaxError("unsupported pseudo-class");
      });

      fire(view.get("button"), "focusin");

      expect(view.get(SLOT).hasAttribute("data-open")).toBe(true);
    });
  });

  describe("flip", () => {
    const rectAt = (bottom: number): DOMRect => new DOMRect(0, bottom - 20, 50, 20);

    function geometry(controlBottom: number): void {
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
        this: HTMLElement,
      ) {
        const clip = this.dataset.clipBottom;
        return rectAt(clip === undefined ? controlBottom : Number(clip));
      });
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(26);
    }

    function mountFlip(
      side: "bottom" | "end" | "bottom-end" | "bottom-start" = "bottom",
      clips: readonly number[] = [],
    ) {
      const tip = (
        <Tooltip label="Tip" side={side} flip>
          <button type="button">c</button>
        </Tooltip>
      );
      const view = render(
        clips.reduceRight(
          (inner, bottom) => (
            <div data-clip-bottom={bottom} style={{ overflowY: "auto" }}>
              {inner}
            </div>
          ),
          tip,
        ),
      );
      return view;
    }

    it("keeps the chosen side while there is room below inside the clipping box", () => {
      geometry(100);
      const view = mountFlip("bottom", [400]);

      hover(view.get("button"));

      expect(view.get(SLOT).dataset.side).toBe("bottom");
    });

    it("opens upward when the bubble would be cut off by the clipping box", () => {
      geometry(390);
      const view = mountFlip("bottom", [400]);

      hover(view.get("button"));

      expect(view.get(SLOT).dataset.side).toBe("top");
    });

    it("flips a bottom-end bubble too", () => {
      geometry(390);
      const view = mountFlip("bottom-end", [400]);

      hover(view.get("button"));

      expect(view.get(SLOT).dataset.side).toBe("top");
    });

    it("flips a bottom-start bubble to the matching top-start side", () => {
      geometry(390);
      const view = mountFlip("bottom-start", [400]);

      hover(view.get("button"));

      expect(view.get(SLOT).dataset.side).toBe("top-start");
    });

    it("places a bubble that mounts while the control is already hovered", () => {
      geometry(390);
      const tree = (label: string) => (
        <div data-clip-bottom={400} style={{ overflowY: "auto" }}>
          <Tooltip label={label} side="bottom" flip>
            <button type="button">c</button>
          </Tooltip>
        </div>
      );
      const view = render(tree(""));
      hover(view.get("button"));

      view.rerender(tree("Tip"));

      expect(view.get(SLOT).dataset.side).toBe("top");
    });

    it("never turns an end bubble upward, however little room there is below", () => {
      geometry(390);
      const view = mountFlip("end", [400]);

      hover(view.get("button"));

      expect(view.get(SLOT).dataset.side).toBe("end");
    });

    it("measures against the viewport when nothing clips", () => {
      geometry(window.innerHeight - 4);
      const near = mountFlip("bottom");
      hover(near.get("button"));
      expect(near.get(SLOT).dataset.side).toBe("top");

      near.unmount();
      geometry(window.innerHeight - 200);
      const far = mountFlip("bottom");
      hover(far.get("button"));
      expect(far.get(SLOT).dataset.side).toBe("bottom");
    });

    it("caps a clipping box that reaches past the viewport at the viewport edge", () => {
      geometry(window.innerHeight - 4);
      const view = mountFlip("bottom", [window.innerHeight + 500]);

      hover(view.get("button"));

      expect(view.get(SLOT).dataset.side).toBe("top");
    });

    it("honours a tight outer clipping box even when the box nearest the control is roomy", () => {
      geometry(290);
      const view = mountFlip("bottom", [300, 800]);

      hover(view.get("button"));

      expect(view.get(SLOT).dataset.side).toBe("top");
    });

    it("honours a tight inner clipping box when the outer one is roomy, with room to spare for the control", () => {
      geometry(100);
      const view = mountFlip("bottom", [800, 300]);

      hover(view.get("button"));

      expect(view.get(SLOT).dataset.side).toBe("bottom");
    });

    it("has nothing to measure for a disabled control, which renders no bubble", () => {
      geometry(390);
      const view = render(
        <Tooltip label="Tip" side="bottom" flip>
          <button type="button" disabled>
            c
          </button>
        </Tooltip>,
      );

      hover(view.get("button"));

      expect(view.query(SLOT)).toBeNull();
    });

    it("never flips unless asked to", () => {
      geometry(window.innerHeight);
      const view = mount({ side: "bottom" });

      hover(view.get("button"));

      expect(view.get(SLOT).dataset.side).toBe("bottom");
    });
  });

  it("merges a caller className onto the wrapper", () => {
    const view = render(
      <Tooltip label="Tip" className="w-full">
        <button type="button">c</button>
      </Tooltip>,
    );

    expect(view.get("button").parentElement?.className).toContain("w-full");
  });

  it("opens on hover and closes when the pointer leaves", () => {
    const view = mount();

    hover(view.get("button"));
    expect(view.get(SLOT).hasAttribute("data-open")).toBe(true);

    unhover(view.get("button"));
    expect(view.get(SLOT).hasAttribute("data-open")).toBe(false);
  });

  it("opens on keyboard focus and closes on blur", () => {
    const view = mount();

    fire(view.get("button"), "focusin");
    expect(view.get(SLOT).hasAttribute("data-open")).toBe(true);

    fire(view.get("button"), "focusout");
    expect(view.get(SLOT).hasAttribute("data-open")).toBe(false);
  });

  it("dismisses on Escape without moving focus or the pointer", () => {
    const view = mount();
    view.get<HTMLButtonElement>("button").focus();
    hover(view.get("button"));
    expect(view.get(SLOT).hasAttribute("data-open")).toBe(true);

    pressKey("Escape");

    expect(view.get(SLOT).hasAttribute("data-open")).toBe(false);
    expect(document.activeElement).toBe(view.get("button"));
  });

  it("ignores other keys and shows again after a fresh hover", () => {
    const view = mount();
    hover(view.get("button"));

    pressKey("a");
    expect(view.get(SLOT).hasAttribute("data-open")).toBe(true);

    pressKey("Escape");
    unhover(view.get("button"));
    hover(view.get("button"));
    expect(view.get(SLOT).hasAttribute("data-open")).toBe(true);
  });

  it("stays open while the pointer rests on the bubble, since it is hoverable", () => {
    const view = mount();
    hover(view.get("button"));

    expect(view.get(SLOT).className).toContain("data-[open]:pointer-events-auto");
    expect(view.get(SLOT).className).toContain("ps-2");
  });

  it("gives a disabled control no tooltip, and no description", () => {
    const view = mount({ disabled: true });

    expect(view.query("[role='tooltip']")).toBeNull();
    expect(view.get("button").hasAttribute("aria-describedby")).toBe(false);
  });

  it("keeps the same control element when it toggles disabled, so focus is not lost", () => {
    const tree = (disabled: boolean) => (
      <Tooltip label="Copy the key">
        <button type="button" disabled={disabled}>
          c
        </button>
      </Tooltip>
    );
    const view = render(tree(false));
    const button = view.get<HTMLButtonElement>("button");
    button.focus();

    view.rerender(tree(true));
    expect(view.get("button")).toBe(button);
    view.rerender(tree(false));

    expect(view.get("button")).toBe(button);
    expect(view.query("[role='tooltip']")).not.toBeNull();
  });

  it("keeps the same control element when the label becomes empty, which renders no bubble", () => {
    const tree = (label: string) => (
      <Tooltip label={label}>
        <button type="button">c</button>
      </Tooltip>
    );
    const view = render(tree("Held for review"));
    const button = view.get<HTMLButtonElement>("button");
    button.focus();

    view.rerender(tree(""));

    expect(view.get("button")).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(view.query("[role='tooltip']")).toBeNull();
    expect(button.hasAttribute("aria-describedby")).toBe(false);
  });

  it("skips the description when the label repeats the control's own name", () => {
    const view = render(
      <Tooltip label="Expand sidebar">
        <button type="button" aria-label="Expand sidebar">
          c
        </button>
      </Tooltip>,
    );

    expect(view.get("button").hasAttribute("aria-describedby")).toBe(false);
    expect(view.get("[role='tooltip']").getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps the bubble open while the pointer moves from the control onto it", () => {
    const view = mount();
    hover(view.get("button"));
    const bubble = view.get("[role='tooltip']");

    act(() => {
      view
        .get("button")
        .dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: bubble }));
      bubble.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, relatedTarget: view.get("button") }),
      );
    });
    expect(view.get(SLOT).hasAttribute("data-open")).toBe(true);

    act(() => {
      bubble.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }),
      );
    });
    expect(view.get(SLOT).hasAttribute("data-open")).toBe(false);
  });

  it("centres the bottom tooltip with a physical offset, also in a right-to-left page", () => {
    const view = render(
      <div dir="rtl">
        <Tooltip label="Reload" side="bottom">
          <button type="button">r</button>
        </Tooltip>
      </div>,
    );
    const className = view.get(SLOT).className;

    expect(className).toContain("left-[calc(50%+var(--tooltip-x,0px))]");
    expect(className).toContain("-translate-x-1/2");
    expect(className).not.toContain("start-1/2");
  });

  it("sits at the inline-end edge by default and below the control on request", () => {
    const end = mount();
    const bottom = mount({ side: "bottom" });

    expect(end.get(SLOT).dataset.side).toBe("end");
    expect(end.get(SLOT).className).toContain("start-[calc(100%+var(--tooltip-x,0px))]");
    expect(bottom.get(SLOT).dataset.side).toBe("bottom");
    expect(bottom.get(SLOT).className).toContain("top-full");
    expect(bottom.get(SLOT).className).not.toContain("start-[calc(100%");
  });

  it("wraps a non-element child without trying to describe it", () => {
    const view = render(<Tooltip label="Tip">plain text</Tooltip>);

    expect(view.text()).toContain("plain text");
    expect(view.get("[role='tooltip']").textContent).toBe("Tip");
  });

  it("marks a wide bubble, which wraps a long label instead of keeping it on one line", () => {
    const plain = mount();
    expect(plain.get(SLOT).hasAttribute("data-wide")).toBe(false);
    plain.unmount();

    const view = render(
      <Tooltip label="A long translated value" side="bottom-start" wide>
        <button type="button">c</button>
      </Tooltip>,
    );

    expect(view.get(SLOT).hasAttribute("data-wide")).toBe(true);
    expect(view.get(SLOT).dataset.side).toBe("bottom-start");
  });

  describe("fit", () => {
    interface Layout {
      wrapper: [number, number, number, number];
      bubble: [number, number, number, number];
      clip?: [number, number, number, number];
    }

    function rect([left, top, right, bottom]: readonly number[]): DOMRect {
      return new DOMRect(left, top, (right ?? 0) - (left ?? 0), (bottom ?? 0) - (top ?? 0));
    }

    function layout(at: Layout): void {
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
        this: HTMLElement,
      ) {
        if (this.getAttribute("role") === "tooltip") {
          return rect(at.bubble);
        }
        if (this.dataset.clip !== undefined) {
          return rect(at.clip ?? [0, 0, innerWidth, innerHeight]);
        }
        return rect(at.wrapper);
      });
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(26);
    }

    function mountFit(side: "bottom" | "bottom-start" | "top-start", wide = false, flip = false) {
      return render(
        <div data-clip="" style={{ overflowX: "auto", overflowY: "auto" }}>
          <Tooltip label="Tip" side={side} wide={wide} flip={flip}>
            <button type="button">c</button>
          </Tooltip>
        </div>,
      );
    }

    const shiftOf = (view: ReturnType<typeof render>): string =>
      view.get(SLOT).style.getPropertyValue("--tooltip-x");

    it("shifts a bubble that starts before the clipping box back inside it", () => {
      layout({ wrapper: [0, 10, 20, 30], bubble: [-30, 40, 40, 66], clip: [0, 0, 300, 300] });
      const view = mountFit("bottom-start");

      hover(view.get("button"));

      expect(shiftOf(view)).toBe("34px");
    });

    it("shifts a bubble that ends past the clipping box back inside it", () => {
      layout({ wrapper: [260, 10, 280, 30], bubble: [250, 40, 330, 66], clip: [0, 0, 300, 300] });
      const view = mountFit("bottom");

      hover(view.get("button"));

      expect(shiftOf(view)).toBe("-34px");
    });

    it("leaves a bubble that already fits where it is", () => {
      layout({ wrapper: [100, 10, 120, 30], bubble: [100, 40, 170, 66], clip: [0, 0, 300, 300] });
      const view = mountFit("bottom-start");

      hover(view.get("button"));

      expect(shiftOf(view)).toBe("0px");
    });

    it("caps a wide bubble to the clipping box, and a plain one not at all", () => {
      layout({ wrapper: [0, 10, 20, 30], bubble: [0, 40, 100, 66], clip: [0, 0, 200, 300] });
      const wide = mountFit("bottom-start", true);
      hover(wide.get("button"));
      expect(wide.get("[role='tooltip']").style.getPropertyValue("max-width")).toBe("192px");
      wide.unmount();

      const plain = mountFit("bottom-start");
      hover(plain.get("button"));
      expect(plain.get("[role='tooltip']").style.getPropertyValue("max-width")).toBe("");
    });

    it("caps a wide bubble at 28rem when the box is wider", () => {
      layout({ wrapper: [0, 10, 20, 30], bubble: [0, 40, 100, 66], clip: [0, 0, 900, 300] });
      const view = mountFit("bottom-start", true);

      hover(view.get("button"));

      expect(view.get("[role='tooltip']").style.getPropertyValue("max-width")).toBe("448px");
    });

    it("clears the shift and the cap when the bubble closes", () => {
      layout({ wrapper: [0, 10, 20, 30], bubble: [-30, 40, 40, 66], clip: [0, 0, 300, 300] });
      const view = mountFit("bottom-start", true);

      hover(view.get("button"));
      expect(shiftOf(view)).not.toBe("");
      unhover(view.get("button"));

      expect(shiftOf(view)).toBe("");
      expect(view.get("[role='tooltip']").style.getPropertyValue("max-width")).toBe("");
    });

    it("reads the inline direction, so a start-anchored shift flips in a right-to-left page", () => {
      layout({ wrapper: [260, 10, 280, 30], bubble: [250, 40, 330, 66], clip: [0, 0, 300, 300] });
      const view = render(
        <div data-clip="" dir="rtl" style={{ overflowX: "auto", overflowY: "auto" }}>
          <Tooltip label="Tip" side="bottom-start">
            <button type="button">c</button>
          </Tooltip>
        </div>,
      );

      hover(view.get("button"));

      expect(shiftOf(view)).toBe("34px");
    });

    it("shifts an end-anchored bubble the other way along the inline axis", () => {
      layout({ wrapper: [260, 10, 280, 30], bubble: [250, 40, 330, 66], clip: [0, 0, 300, 300] });
      const view = render(
        <div data-clip="" style={{ overflowX: "auto", overflowY: "auto" }}>
          <Tooltip label="Tip" side="bottom-end">
            <button type="button">c</button>
          </Tooltip>
        </div>,
      );

      hover(view.get("button"));

      expect(shiftOf(view)).toBe("34px");
    });

    it("flips a top-start bubble below when there is no room above it", () => {
      layout({ wrapper: [0, 20, 20, 40], bubble: [0, 0, 70, 26], clip: [0, 0, 300, 300] });
      const view = mountFit("top-start", false, true);

      hover(view.get("button"));

      expect(view.get(SLOT).dataset.side).toBe("bottom-start");
    });

    it("keeps a top-start bubble above while there is room", () => {
      layout({ wrapper: [0, 120, 20, 140], bubble: [0, 80, 70, 106], clip: [0, 0, 300, 300] });
      const view = mountFit("top-start", false, true);

      hover(view.get("button"));

      expect(view.get(SLOT).dataset.side).toBe("top-start");
    });
  });
});
