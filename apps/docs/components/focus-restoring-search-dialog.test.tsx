// @vitest-environment jsdom

import { act, type ReactNode, Suspense, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("fumadocs-ui/components/dialog/search-default", () => ({
  default: function FakeDialog({ open }: { open: boolean }): ReactNode {
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => {
      if (open) input.current?.focus();
    }, [open]);
    return open ? <input ref={input} aria-label="search" /> : null;
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { FocusRestoringSearchDialog } = await import("./focus-restoring-search-dialog");

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

async function renderDialog(open: boolean): Promise<void> {
  await act(async () => {
    root?.render(
      <Suspense fallback={null}>
        <FocusRestoringSearchDialog open={open} onOpenChange={() => undefined} />
      </Suspense>,
    );
  });
}

function setup(): { opener: HTMLButtonElement; other: HTMLButtonElement } {
  const opener = document.createElement("button");
  const other = document.createElement("button");
  const container = document.createElement("div");
  document.body.append(opener, other, container);
  root = createRoot(container);
  return { opener, other };
}

describe("FocusRestoringSearchDialog", () => {
  it("returns focus to the element that opened search when it closes", async () => {
    const { opener } = setup();
    opener.focus();
    await renderDialog(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("search");
    await renderDialog(false);
    expect(document.activeElement).toBe(opener);
  });

  it("returns focus to whatever was focused when the hotkey opened it, on every reopen", async () => {
    const { opener, other } = setup();
    opener.focus();
    await renderDialog(true);
    await renderDialog(false);
    other.focus();
    await renderDialog(true);
    await renderDialog(false);
    expect(document.activeElement).toBe(other);
  });

  it("leaves focus alone when the opener has left the page", async () => {
    const { opener } = setup();
    opener.focus();
    await renderDialog(true);
    opener.remove();
    await renderDialog(false);
    expect(document.activeElement).toBe(document.body);
  });
});
