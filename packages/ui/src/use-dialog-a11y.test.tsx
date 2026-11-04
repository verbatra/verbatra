// @vitest-environment jsdom
import { type ReactNode, useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { pressKey, render } from "./test-support.tsx";
import { useDialogA11y } from "./use-dialog-a11y.ts";

interface DialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly attachRef?: boolean;
  readonly shouldRestoreFocus?: () => boolean;
  readonly children?: ReactNode;
}

function Dialog({
  isOpen,
  onClose,
  attachRef = true,
  shouldRestoreFocus,
  children,
}: DialogProps): ReactNode {
  const containerRef = useDialogA11y<HTMLDivElement>({
    isOpen,
    onClose,
    ...(shouldRestoreFocus !== undefined ? { shouldRestoreFocus } : {}),
  });
  return (
    <div ref={attachRef ? containerRef : null} data-testid="dialog">
      {children}
    </div>
  );
}

const CONTENT: ReactNode = (
  <>
    <button type="button" id="first">
      First
    </button>
    <input id="middle" aria-label="Middle" />
    <button type="button" id="last">
      Last
    </button>
  </>
);

describe("useDialogA11y", () => {
  it("moves focus to the first focusable element when the dialog opens", () => {
    const view = render(
      <Dialog isOpen onClose={vi.fn()}>
        {CONTENT}
      </Dialog>,
    );

    expect(document.activeElement).toBe(view.get("#first"));
  });

  it("calls onClose on Escape, leaving the unmounting to the caller", () => {
    const onClose = vi.fn();
    const view = render(
      <Dialog isOpen onClose={onClose}>
        {CONTENT}
      </Dialog>,
    );

    pressKey("Escape");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(view.query("#first")).not.toBeNull();
  });

  it("wraps Tab from the last focusable element back to the first", () => {
    const view = render(
      <Dialog isOpen onClose={vi.fn()}>
        {CONTENT}
      </Dialog>,
    );
    view.get("#last").focus();

    pressKey("Tab");

    expect(document.activeElement).toBe(view.get("#first"));
  });

  it("wraps Shift+Tab from the first focusable element back to the last", () => {
    const view = render(
      <Dialog isOpen onClose={vi.fn()}>
        {CONTENT}
      </Dialog>,
    );

    pressKey("Tab", { shiftKey: true });

    expect(document.activeElement).toBe(view.get("#last"));
  });

  it("leaves a Tab in the middle of the dialog to the browser's own order", () => {
    const view = render(
      <Dialog isOpen onClose={vi.fn()}>
        {CONTENT}
      </Dialog>,
    );
    const middle = view.get("#middle");
    middle.focus();

    pressKey("Tab");

    expect(document.activeElement).toBe(middle);
  });

  it("keeps focus where it is on Tab when the dialog holds no focusable element", () => {
    render(
      <Dialog isOpen onClose={vi.fn()}>
        <p>Nothing to focus here.</p>
      </Dialog>,
    );
    const before = document.activeElement;

    const event = pressKey("Tab");

    expect(document.activeElement).toBe(before);
    expect(event.defaultPrevented).toBe(true);
  });

  it("opens and closes without error when focus sat on a non-HTML element", () => {
    const view = render(
      <>
        <svg id="graphic" aria-label="graphic" />
        <Dialog isOpen={false} onClose={vi.fn()}>
          {CONTENT}
        </Dialog>
      </>,
    );
    view.get("#graphic").setAttribute("tabindex", "0");
    view.get<SVGElement & HTMLElement>("#graphic").focus();

    view.rerender(
      <>
        <svg id="graphic" aria-label="graphic" />
        <Dialog isOpen onClose={vi.fn()}>
          {CONTENT}
        </Dialog>
      </>,
    );
    expect(() =>
      view.rerender(
        <>
          <svg id="graphic" aria-label="graphic" />
          <Dialog isOpen={false} onClose={vi.fn()}>
            {CONTENT}
          </Dialog>
        </>,
      ),
    ).not.toThrow();
  });

  it("pulls Tab back to the first element when focus rests outside the dialog", () => {
    const view = render(
      <>
        <button type="button" id="outside">
          Outside
        </button>
        <Dialog isOpen onClose={vi.fn()}>
          {CONTENT}
        </Dialog>
      </>,
    );
    view.get<HTMLButtonElement>("#outside").focus();

    const event = pressKey("Tab");

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(view.get("#first"));
  });

  it("pulls Shift+Tab back to the last element when focus rests outside the dialog", () => {
    const view = render(
      <>
        <button type="button" id="outside">
          Outside
        </button>
        <Dialog isOpen onClose={vi.fn()}>
          {CONTENT}
        </Dialog>
      </>,
    );
    view.get<HTMLButtonElement>("#outside").focus();

    pressKey("Tab", { shiftKey: true });

    expect(document.activeElement).toBe(view.get("#last"));
  });

  it("traps Tab when focus fell to the body after a pointer click on plain content", () => {
    const view = render(
      <Dialog isOpen onClose={vi.fn()}>
        <p id="plain">Plain text</p>
        {CONTENT}
      </Dialog>,
    );
    view.get<HTMLButtonElement>("#last").focus();
    (document.activeElement as HTMLElement).blur();

    pressKey("Tab");
    expect(document.activeElement).toBe(view.get("#first"));

    (document.activeElement as HTMLElement).blur();
    pressKey("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(view.get("#last"));
  });

  it("still closes on Escape when the container ref was never attached", () => {
    const onClose = vi.fn();
    render(
      <Dialog isOpen onClose={onClose} attachRef={false}>
        {CONTENT}
      </Dialog>,
    );
    const before = document.activeElement;

    pressKey("Tab");
    pressKey("Escape");

    expect(document.activeElement).toBe(before);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("installs nothing while the dialog is closed", () => {
    const onClose = vi.fn();
    const view = render(
      <Dialog isOpen={false} onClose={onClose}>
        {CONTENT}
      </Dialog>,
    );

    pressKey("Escape");

    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(view.get("#first"));
  });

  it("returns focus to the element focused before opening when the dialog closes", () => {
    const onClose = vi.fn();
    const closed = (
      <>
        <button type="button" id="opener">
          Open
        </button>
        <Dialog isOpen={false} onClose={onClose}>
          {CONTENT}
        </Dialog>
      </>
    );
    const view = render(closed);
    const opener = view.get("#opener");
    opener.focus();

    view.rerender(
      <>
        <button type="button" id="opener">
          Open
        </button>
        <Dialog isOpen onClose={onClose}>
          {CONTENT}
        </Dialog>
      </>,
    );
    expect(document.activeElement).toBe(view.get("#first"));
    view.rerender(closed);

    expect(document.activeElement).toBe(opener);
  });

  it("returns focus to the element focused before opening when the dialog unmounts", () => {
    const opener = document.createElement("button");
    opener.type = "button";
    document.body.appendChild(opener);
    opener.focus();
    const view = render(
      <Dialog isOpen onClose={vi.fn()}>
        {CONTENT}
      </Dialog>,
    );
    expect(document.activeElement).toBe(view.get("#first"));

    view.unmount();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("leaves focus alone on unmount when the caller says not to restore it", () => {
    const opener = document.createElement("button");
    opener.type = "button";
    document.body.appendChild(opener);
    opener.focus();
    const view = render(
      <Dialog isOpen onClose={vi.fn()} shouldRestoreFocus={() => false}>
        {CONTENT}
      </Dialog>,
    );

    view.unmount();

    expect(document.activeElement).not.toBe(opener);
    opener.remove();
  });

  it("does not restore focus to an opener that left the document while the dialog was open", () => {
    const opener = document.createElement("button");
    opener.type = "button";
    document.body.appendChild(opener);
    opener.focus();
    const focus = vi.spyOn(opener, "focus");
    const view = render(
      <Dialog isOpen onClose={vi.fn()}>
        {CONTENT}
      </Dialog>,
    );

    opener.remove();
    view.unmount();

    expect(focus).not.toHaveBeenCalled();
  });

  it("calls the callback from the latest render, not the one the trap was built with", () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = render(
      <Dialog isOpen onClose={first}>
        {CONTENT}
      </Dialog>,
    );

    view.rerender(
      <Dialog isOpen onClose={second}>
        {CONTENT}
      </Dialog>,
    );
    pressKey("Escape");

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});

function LateFieldDialog({ ready }: { readonly ready: boolean }): ReactNode {
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useDialogA11y<HTMLDivElement>({
    isOpen: true,
    onClose: () => {},
    initialFocus: fieldRef,
  });
  return (
    <div ref={containerRef}>
      <button type="button" id="close">
        Close
      </button>
      {ready ? <textarea id="field" ref={fieldRef} /> : null}
    </div>
  );
}

describe("useDialogA11y: initial focus", () => {
  it("focuses and scrolls to the requested element when it is there at open", () => {
    const scrolled = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrolled;
    const view = render(<LateFieldDialog ready />);

    expect(document.activeElement).toBe(view.get("#field"));
    expect(scrolled).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("waits for an element that mounts after open, then focuses it once", () => {
    const view = render(<LateFieldDialog ready={false} />);
    expect(document.activeElement).toBe(view.get("#close"));

    view.rerender(<LateFieldDialog ready />);
    expect(document.activeElement).toBe(view.get("#field"));

    view.get("#close").focus();
    view.rerender(<LateFieldDialog ready />);
    expect(document.activeElement).toBe(view.get("#close"));
  });

  it("lets only the topmost of nested dialogs handle Escape and Tab", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const view = render(
      <>
        <Dialog isOpen onClose={outer}>
          <button type="button" id="outer-first">
            Outer
          </button>
        </Dialog>
        <Dialog isOpen onClose={inner}>
          <button type="button" id="inner-first">
            Inner one
          </button>
          <button type="button" id="inner-last">
            Inner two
          </button>
        </Dialog>
      </>,
    );
    view.get<HTMLButtonElement>("#inner-last").focus();

    pressKey("Escape");
    const tab = pressKey("Tab");

    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(view.get("#inner-first"));
  });

  it("hands Escape back to the outer dialog once the inner one closes", () => {
    const outer = vi.fn();
    const view = render(
      <>
        <Dialog isOpen onClose={outer}>
          <button type="button">Outer</button>
        </Dialog>
        <Dialog isOpen onClose={vi.fn()}>
          <button type="button">Inner</button>
        </Dialog>
      </>,
    );

    view.rerender(
      <>
        <Dialog isOpen onClose={outer}>
          <button type="button">Outer</button>
        </Dialog>
        <Dialog isOpen={false} onClose={vi.fn()}>
          <button type="button">Inner</button>
        </Dialog>
      </>,
    );
    pressKey("Escape");

    expect(outer).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape to the inner dialog when the outer one unmounts first", () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const both = (
      <>
        <Dialog isOpen onClose={outer}>
          <button type="button">Outer</button>
        </Dialog>
        <Dialog isOpen onClose={inner}>
          <button type="button">Inner</button>
        </Dialog>
      </>
    );
    const view = render(both);

    view.rerender(
      <>
        {null}
        <Dialog isOpen onClose={inner}>
          <button type="button">Inner</button>
        </Dialog>
      </>,
    );
    pressKey("Escape");

    expect(outer).not.toHaveBeenCalled();
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("locks document scroll while open, across nested dialogs, and restores it", () => {
    document.documentElement.style.overflow = "";
    const outer = render(<Dialog isOpen onClose={vi.fn()} />);
    expect(document.documentElement.style.overflow).toBe("hidden");

    const inner = render(<Dialog isOpen onClose={vi.fn()} />);
    inner.unmount();
    expect(document.documentElement.style.overflow).toBe("hidden");

    outer.unmount();
    expect(document.documentElement.style.overflow).toBe("");
  });
});
