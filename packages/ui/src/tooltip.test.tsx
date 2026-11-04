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

  it("gives a disabled control no tooltip at all", () => {
    const view = mount({ disabled: true });

    expect(view.query("[role='tooltip']")).toBeNull();
    expect(view.get("button").hasAttribute("aria-describedby")).toBe(false);
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
