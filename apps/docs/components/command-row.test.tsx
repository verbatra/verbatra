// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const { CommandRow } = await import("./command-row");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const writeText = vi.fn<(text: string) => Promise<void>>();
let root: Root | undefined;

function render(wrapsWhenNarrow?: boolean): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <CommandRow
        command={NPM_INSTALL_COMMAND}
        label="copy"
        event="copy-install-command"
        {...(wrapsWhenNarrow === undefined ? {} : { wrapsWhenNarrow })}
      />,
    ),
  );
  return container;
}

async function clickCopy(container: HTMLDivElement): Promise<void> {
  await act(async () => {
    container.querySelector("button")?.click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  window.umami = undefined;
  document.body.innerHTML = "";
});

describe("CommandRow", () => {
  it("copies its command and sends its event with the copied text, once per copy", async () => {
    const track = vi.fn();
    window.umami = { track };
    const container = render();
    const button = container.querySelector("button");
    expect(button?.getAttribute("aria-label")).toBe("copy");
    await clickCopy(container);
    expect(writeText.mock.calls).toEqual([[NPM_INSTALL_COMMAND]]);
    expect(track.mock.calls).toEqual([["copy-install-command", { command: NPM_INSTALL_COMMAND }]]);
    expect(button?.textContent).toBe("copied");
  });

  it("sends no event when the clipboard refuses the copy", async () => {
    const track = vi.fn();
    window.umami = { track };
    writeText.mockRejectedValue(new Error("denied"));
    const container = render();
    await clickCopy(container);
    expect(track).not.toHaveBeenCalled();
    const button = container.querySelector("button");
    expect(button?.textContent).toBe("copyFailed");
    expect(button?.dataset.status).toBe("failed");
    expect(button?.className).toContain("var(--text-danger)");
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("copyFailed");
  });

  it("announces each copy in a polite live region outside the labelled button", async () => {
    const container = render();
    await clickCopy(container);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.closest("button")).toBeNull();
    expect(live?.textContent).toBe("copied");
    const first = live?.firstElementChild;
    await clickCopy(container);
    expect(live?.firstElementChild).not.toBe(first);
    expect(live?.textContent).toBe("copied");
  });

  it("wraps the command under a narrow container only when asked to", () => {
    const narrow = "@max-[30rem]:whitespace-normal";
    expect(render(true).querySelector("code")?.classList.contains(narrow)).toBe(true);
    act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = "";
    const code = render().querySelector("code");
    expect(code?.classList.contains(narrow)).toBe(false);
    expect(code?.classList.contains("whitespace-nowrap")).toBe(true);
    expect(code?.classList.contains("vk-edge-fade")).toBe(true);
  });
});
