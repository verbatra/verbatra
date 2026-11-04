// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Popover } from "./popover.tsx";
import { click, pressKey, render } from "./test-support.tsx";

const PANEL = "[data-popover]";

function pointerDownOn(target: EventTarget): void {
  act(() => {
    target.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
}

function anchorButton(): ReactNode {
  return (
    <button type="button" id="anchor">
      Open
    </button>
  );
}

function stubGeometry(options: {
  readonly anchor: { top: number; bottom: number };
  readonly panel: { left: number; width: number };
  readonly scrollHeight: number;
  readonly viewport: { width: number; height: number };
}): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const isPanel = this.hasAttribute("data-popover");
    const shift = Number.parseFloat(
      /translateX\((-?\d+)px\)/.exec(this.style.transform)?.[1] ?? "0",
    );
    return isPanel
      ? ({
          left: options.panel.left + shift,
          width: options.panel.width,
          top: 0,
          bottom: 0,
          right: 0,
          height: 0,
        } as DOMRect)
      : ({ top: options.anchor.top, bottom: options.anchor.bottom } as DOMRect);
  });
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(options.scrollHeight);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(options.scrollHeight);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(options.scrollHeight);
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(options.viewport.width);
  vi.stubGlobal("innerHeight", options.viewport.height);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Popover", () => {
  it("renders the anchor but no panel while closed", () => {
    const view = render(
      <Popover open={false} onClose={() => {}} anchor={anchorButton()}>
        <p>Panel body</p>
      </Popover>,
    );

    expect(view.get("#anchor")).not.toBeNull();
    expect(view.query(PANEL)).toBeNull();
  });

  it("renders the panel content while open", () => {
    const view = render(
      <Popover open onClose={() => {}} anchor={anchorButton()}>
        <p>Panel body</p>
      </Popover>,
    );

    expect(view.getByText("p", "Panel body")).not.toBeNull();
  });

  it("aligns the panel to the inline start by default and to the inline end on request", () => {
    const start = render(
      <Popover open onClose={() => {}} anchor={anchorButton()}>
        <p>Body</p>
      </Popover>,
    );
    const end = render(
      <Popover open onClose={() => {}} anchor={anchorButton()} align="end">
        <p>Body</p>
      </Popover>,
    );

    expect(start.get(PANEL).classList.contains("start-0")).toBe(true);
    expect(start.get(PANEL).classList.contains("end-0")).toBe(false);
    expect(end.get(PANEL).classList.contains("end-0")).toBe(true);
  });

  it("is a dialog that is not modal by default, named by the label", () => {
    const view = render(
      <Popover open onClose={() => {}} anchor={anchorButton()} ariaLabel="Filters">
        <p>Body</p>
      </Popover>,
    );
    const panel = view.get(PANEL);

    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-modal")).toBe("false");
    expect(panel.getAttribute("aria-label")).toBe("Filters");
  });

  it("can be a menu, which carries no modal flag", () => {
    const view = render(
      <Popover open onClose={() => {}} anchor={anchorButton()} role="menu" ariaLabel="Actions">
        <p>Body</p>
      </Popover>,
    );

    expect(view.get(PANEL).getAttribute("role")).toBe("menu");
    expect(view.get(PANEL).hasAttribute("aria-modal")).toBe(false);
  });

  it("closes on a pointer press outside and ignores one inside", () => {
    const onClose = vi.fn();
    const view = render(
      <>
        <p id="outside">Outside</p>
        <Popover open onClose={onClose} anchor={anchorButton()}>
          <p id="inside">Inside</p>
        </Popover>
      </>,
    );

    pointerDownOn(view.get("#inside"));
    pointerDownOn(view.get("#anchor"));
    expect(onClose).not.toHaveBeenCalled();

    pointerDownOn(view.get("#outside"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and returns focus to the anchor from inside the panel", () => {
    const onClose = vi.fn();
    const view = render(
      <Popover open onClose={onClose} anchor={anchorButton()}>
        <button type="button" id="item">
          Item
        </button>
      </Popover>,
    );
    view.get<HTMLButtonElement>("#item").focus();

    pressKey("Escape");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(view.get("#anchor"));
  });

  it("returns focus to the anchor when Escape is pressed with focus on the page body", () => {
    const view = render(
      <Popover open onClose={() => {}} anchor={anchorButton()}>
        <p>Body</p>
      </Popover>,
    );
    (document.activeElement as HTMLElement | null)?.blur();

    pressKey("Escape");

    expect(document.activeElement).toBe(view.get("#anchor"));
  });

  it("does not steal focus from elsewhere on the page when Escape is pressed", () => {
    const view = render(
      <>
        <input id="elsewhere" aria-label="Elsewhere" />
        <Popover open onClose={() => {}} anchor={anchorButton()}>
          <p>Body</p>
        </Popover>
      </>,
    );
    view.get<HTMLInputElement>("#elsewhere").focus();

    pressKey("Escape");

    expect(document.activeElement).toBe(view.get("#elsewhere"));
  });

  it("ignores other keys and installs nothing while closed", () => {
    const onClose = vi.fn();
    render(
      <Popover open onClose={onClose} anchor={anchorButton()}>
        <p>Body</p>
      </Popover>,
    );
    render(
      <Popover open={false} onClose={onClose} anchor={anchorButton()}>
        <p>Body</p>
      </Popover>,
    );

    pressKey("a");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes its listeners when it closes", () => {
    const onClose = vi.fn();
    const view = render(
      <Popover open onClose={onClose} anchor={anchorButton()}>
        <p>Body</p>
      </Popover>,
    );

    view.rerender(
      <Popover open={false} onClose={onClose} anchor={anchorButton()}>
        <p>Body</p>
      </Popover>,
    );
    pressKey("Escape");
    pointerDownOn(document.body);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps a panel that fits in place", () => {
    stubGeometry({
      anchor: { top: 100, bottom: 130 },
      panel: { left: 20, width: 180 },
      scrollHeight: 100,
      viewport: { width: 375, height: 700 },
    });
    const view = render(
      <Popover open onClose={() => {}} anchor={anchorButton()}>
        <p>Body</p>
      </Popover>,
    );

    expect(view.get(PANEL).style.transform).toBe("");
    expect(view.get(PANEL).dataset.side).toBe("bottom");
  });

  it("shifts a panel back inside a 375 wide viewport", () => {
    stubGeometry({
      anchor: { top: 100, bottom: 130 },
      panel: { left: 300, width: 180 },
      scrollHeight: 100,
      viewport: { width: 375, height: 700 },
    });
    const view = render(
      <Popover open onClose={() => {}} anchor={anchorButton()}>
        <p>Body</p>
      </Popover>,
    );

    expect(view.get(PANEL).style.transform).toBe("translateX(-113px)");
  });

  it("flips above and limits its height when the room below is too small", () => {
    stubGeometry({
      anchor: { top: 500, bottom: 530 },
      panel: { left: 20, width: 180 },
      scrollHeight: 300,
      viewport: { width: 375, height: 600 },
    });
    const view = render(
      <Popover open onClose={() => {}} anchor={anchorButton()}>
        <p>Body</p>
      </Popover>,
    );
    const panel = view.get(PANEL);

    expect(panel.dataset.side).toBe("top");
    expect(panel.classList.contains("bottom-full")).toBe(true);
    expect(panel.style.maxHeight).toBe("488px");
  });

  it("measures again when the window resizes", () => {
    stubGeometry({
      anchor: { top: 100, bottom: 130 },
      panel: { left: 300, width: 180 },
      scrollHeight: 100,
      viewport: { width: 375, height: 700 },
    });
    const view = render(
      <Popover open onClose={() => {}} anchor={anchorButton()}>
        <p>Body</p>
      </Popover>,
    );
    expect(view.get(PANEL).style.transform).toBe("translateX(-113px)");

    stubGeometry({
      anchor: { top: 100, bottom: 130 },
      panel: { left: 300, width: 180 },
      scrollHeight: 100,
      viewport: { width: 1024, height: 700 },
    });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(view.get(PANEL).style.transform).toBe("");
  });

  it("keeps its placement when a resize changes nothing", () => {
    stubGeometry({
      anchor: { top: 100, bottom: 130 },
      panel: { left: 300, width: 180 },
      scrollHeight: 100,
      viewport: { width: 375, height: 700 },
    });
    const view = render(
      <Popover open onClose={() => {}} anchor={anchorButton()}>
        <p>Body</p>
      </Popover>,
    );

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(view.get(PANEL).style.transform).toBe("translateX(-113px)");
  });

  it("forgets its placement once closed", () => {
    stubGeometry({
      anchor: { top: 100, bottom: 130 },
      panel: { left: 300, width: 180 },
      scrollHeight: 100,
      viewport: { width: 375, height: 700 },
    });
    const view = render(
      <Popover open onClose={() => {}} anchor={anchorButton()}>
        <p>Body</p>
      </Popover>,
    );
    view.rerender(
      <Popover open={false} onClose={() => {}} anchor={anchorButton()}>
        <p>Body</p>
      </Popover>,
    );
    view.rerender(
      <Popover open onClose={() => {}} anchor={anchorButton()}>
        <p>Body</p>
      </Popover>,
    );

    expect(view.get(PANEL).style.transform).toBe("translateX(-113px)");
  });

  it("is closed again by the anchor click the caller wires", () => {
    const onClose = vi.fn();
    const view = render(
      <Popover
        open
        onClose={onClose}
        anchor={
          <button type="button" id="anchor" onClick={onClose}>
            Toggle
          </button>
        }
      >
        <p>Body</p>
      </Popover>,
    );

    click(view.get("#anchor"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
