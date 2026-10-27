// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CopyOptions, type CopyState, useCopyToClipboard } from "./use-copy-to-clipboard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const writeText = vi.fn<(text: string) => Promise<void>>();
let root: Root | undefined;
let latest: CopyState | undefined;
let renders = 0;

function Probe({ options }: { options: CopyOptions | undefined }) {
  latest = useCopyToClipboard(options);
  renders += 1;
  return null;
}

function mount(options?: CopyOptions): () => CopyState {
  root = createRoot(document.createElement("div"));
  act(() => root?.render(createElement(Probe, { options })));
  return () => {
    if (!latest) throw new Error("hook not rendered");
    return latest;
  };
}

async function copy(state: () => CopyState, text = "x"): Promise<boolean> {
  let result = false;
  await act(async () => {
    result = await state().copy(text);
  });
  return result;
}

beforeEach(() => {
  vi.useFakeTimers();
  renders = 0;
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  latest = undefined;
  vi.useRealTimers();
});

describe("useCopyToClipboard", () => {
  it("starts idle with no attempts", () => {
    const state = mount();
    expect(state().status).toBe("idle");
    expect(state().attempts).toBe(0);
  });

  it("writes the text, reports copied and resets to idle after the delay", async () => {
    const state = mount({ resetDelayMs: 100 });
    expect(await copy(state, "hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(state().status).toBe("copied");
    act(() => vi.advanceTimersByTime(99));
    expect(state().status).toBe("copied");
    act(() => vi.advanceTimersByTime(1));
    expect(state().status).toBe("idle");
  });

  it("reports a refused write as failed and resets it after the delay by default", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const state = mount({ resetDelayMs: 100 });
    expect(await copy(state)).toBe(false);
    expect(state().status).toBe("failed");
    act(() => vi.advanceTimersByTime(100));
    expect(state().status).toBe("idle");
  });

  it("holds a failure until the next copy or an explicit reset when asked to", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const state = mount({ resetDelayMs: 100, holdFailure: true });
    await copy(state);
    act(() => vi.advanceTimersByTime(10_000));
    expect(state().status).toBe("failed");
    act(() => state().reset());
    expect(state().status).toBe("idle");

    await copy(state);
    writeText.mockResolvedValue(undefined);
    await copy(state);
    expect(state().status).toBe("copied");
    act(() => vi.advanceTimersByTime(100));
    expect(state().status).toBe("idle");
  });

  it("counts every attempt, successful or not", async () => {
    const state = mount();
    await copy(state);
    writeText.mockRejectedValueOnce(new Error("denied"));
    await copy(state);
    await copy(state);
    expect(state().attempts).toBe(3);
  });

  it("restarts the reset window from a second copy, clearing the first timeout", async () => {
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const state = mount({ resetDelayMs: 100 });
    await copy(state);
    act(() => vi.advanceTimersByTime(60));
    const cleared = clear.mock.calls.length;
    await copy(state);
    expect(clear.mock.calls.length).toBeGreaterThan(cleared);
    act(() => vi.advanceTimersByTime(60));
    expect(state().status).toBe("copied");
    act(() => vi.advanceTimersByTime(40));
    expect(state().status).toBe("idle");
    expect(vi.getTimerCount()).toBe(0);
    clear.mockRestore();
  });

  it("neither updates state nor starts a timer when the write settles after unmount", async () => {
    let settle: () => void = () => undefined;
    writeText.mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );
    const state = mount({ resetDelayMs: 100 });
    const pending = state().copy("late");
    const before = renders;
    act(() => root?.unmount());
    root = undefined;
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    settle();
    await expect(pending).resolves.toBe(true);
    expect(renders).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("clears a pending reset timer on unmount", async () => {
    const state = mount({ resetDelayMs: 100 });
    await copy(state);
    expect(vi.getTimerCount()).toBe(1);
    act(() => root?.unmount());
    root = undefined;
    expect(vi.getTimerCount()).toBe(0);
  });
});
