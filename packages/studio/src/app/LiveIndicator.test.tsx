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
  it("shows a quiet Live marker with a success dot while the stream is healthy", () => {
    const view = render(<LiveIndicator />);

    expect(view.get('[role="status"]').textContent).toBe("Live");
    expect(view.get("[data-live] span").getAttribute("aria-hidden")).toBe("true");
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

    expect(view.get('[role="status"] [data-tone]').dataset.tone).toBe("warning");
  });

  it("clears the notice the moment the stream recovers, without waiting out a delay", () => {
    vi.useFakeTimers();
    const view = render(<LiveIndicator />);

    setConnectionStatus("reconnecting");
    advance(DEGRADED_DELAY_MS);
    setConnectionStatus("live");

    expect(view.get('[role="status"]').textContent).toBe("Live");
  });

  it("never shows the notice for a blip that recovers inside the delay", () => {
    vi.useFakeTimers();
    const view = render(<LiveIndicator />);

    setConnectionStatus("reconnecting");
    advance(DEGRADED_DELAY_MS - 500);
    setConnectionStatus("live");
    advance(DEGRADED_DELAY_MS);

    expect(view.get('[role="status"]').textContent).toBe("Live");
  });

  it("picks up a status that was already degraded before the header mounted", () => {
    vi.useFakeTimers();
    setConnectionStatus("reconnecting");
    const view = render(<LiveIndicator />);
    advance(DEGRADED_DELAY_MS);

    expect(view.get('[role="status"]').textContent).toBe("Reconnecting");
  });

  it("shows neither marker during the first moments of a degraded stream", () => {
    vi.useFakeTimers();
    const view = render(<LiveIndicator />);

    setConnectionStatus("reconnecting");
    advance(DEGRADED_DELAY_MS - 1);

    expect(view.query("[data-live]")).toBeNull();
  });

  it("shows the live label as screen-reader text below md and keeps the dot", () => {
    const view = render(<LiveIndicator />);

    expect(view.get("[data-live] span:last-child").className).toContain("max-md:sr-only");
    expect(view.get("[data-live] span").getAttribute("aria-hidden")).toBe("true");
  });

  it("shows a warning dot below md while the label stays readable", () => {
    vi.useFakeTimers();
    const view = render(<LiveIndicator />);

    setConnectionStatus("reconnecting");
    advance(DEGRADED_DELAY_MS);

    expect(view.get("[data-dot=warning]").className).toContain("md:hidden");
    expect(view.get('[role="status"] > span').className).toContain("max-md:sr-only");
    expect(view.get('[role="status"]').textContent).toBe("Reconnecting");
  });
});
