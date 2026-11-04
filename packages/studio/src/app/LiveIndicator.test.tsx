// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveIndicator } from "./LiveIndicator.js";
import { render, setConnectionStatus } from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const DEGRADED_DELAY_MS = 1500;

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

afterEach(() => {
  vi.useRealTimers();
  setConnectionStatus("live");
});

describe("LiveIndicator", () => {
  it("keeps the live-status region mounted but silent while the stream is healthy", () => {
    const view = render(<LiveIndicator />);

    expect(view.get('[role="status"]').textContent).toBe("");
  });

  it("stays silent for the first moments of a degraded stream, so a normal handshake never flashes", () => {
    vi.useFakeTimers();
    const view = render(<LiveIndicator />);

    setConnectionStatus("reconnecting");
    advance(DEGRADED_DELAY_MS - 1);

    expect(view.get('[role="status"]').textContent).toBe("");
  });

  it("announces reconnecting in the status region once the stream stays degraded", () => {
    vi.useFakeTimers();
    const view = render(<LiveIndicator />);

    setConnectionStatus("reconnecting");
    advance(DEGRADED_DELAY_MS);

    expect(view.get('[role="status"]').textContent).toBe("Reconnecting");
  });

  it("renders the reconnecting notice as a warning pill", () => {
    vi.useFakeTimers();
    const view = render(<LiveIndicator />);

    setConnectionStatus("reconnecting");
    advance(DEGRADED_DELAY_MS);

    expect(view.get('[role="status"] > span').dataset.tone).toBe("warning");
  });

  it("clears the notice the moment the stream recovers, without waiting out a delay", () => {
    vi.useFakeTimers();
    const view = render(<LiveIndicator />);

    setConnectionStatus("reconnecting");
    advance(DEGRADED_DELAY_MS);
    setConnectionStatus("live");

    expect(view.get('[role="status"]').textContent).toBe("");
  });
});
