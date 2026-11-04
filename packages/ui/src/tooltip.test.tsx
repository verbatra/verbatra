// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it } from "vitest";
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

    expect(className).toContain("left-1/2");
    expect(className).toContain("-translate-x-1/2");
    expect(className).not.toContain("start-1/2");
  });

  it("sits at the inline-end edge by default and below the control on request", () => {
    const end = mount();
    const bottom = mount({ side: "bottom" });

    expect(end.get(SLOT).dataset.side).toBe("end");
    expect(end.get(SLOT).className).toContain("start-full");
    expect(bottom.get(SLOT).dataset.side).toBe("bottom");
    expect(bottom.get(SLOT).className).toContain("top-full");
    expect(bottom.get(SLOT).className).not.toContain("start-full");
  });

  it("wraps a non-element child without trying to describe it", () => {
    const view = render(<Tooltip label="Tip">plain text</Tooltip>);

    expect(view.text()).toContain("plain text");
    expect(view.get("[role='tooltip']").textContent).toBe("Tip");
  });
});
