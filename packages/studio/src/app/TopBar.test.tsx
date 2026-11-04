// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar.js";
import { render, setConnectionStatus } from "./test-support.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

const DEGRADED_DELAY_MS = 1500;

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function mount(): ReturnType<typeof render> {
  return render(<TopBar pageLabel="Review" onOpenNav={() => {}} />);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("TopBar", () => {
  it("shows the active page's label as orientation text, not as a heading", () => {
    const view = mount();

    expect(view.getByText("span", "Review")).not.toBeNull();
    expect(view.query("h1")).toBeNull();
  });

  it("names the mobile nav trigger, since it renders as a glyph only", () => {
    const view = mount();

    expect(view.get('[aria-label="Open navigation"]')).not.toBeNull();
  });

  it("opens the nav drawer when the trigger is pressed", () => {
    const onOpenNav = vi.fn();
    const view = render(<TopBar pageLabel="Review" onOpenNav={onOpenNav} />);

    act(() => {
      view.get('[aria-label="Open navigation"]').click();
    });

    expect(onOpenNav).toHaveBeenCalledTimes(1);
  });

  it("offers the theme toggle, named with the current mode and the next action", () => {
    const view = mount();

    expect(view.get('[aria-label="Theme: System. Switch to Light."]')).not.toBeNull();
  });

  it("keeps the live-status region mounted but silent while the stream is healthy", () => {
    const view = mount();

    expect(view.get('[role="status"]').textContent).toBe("");
  });

  it("stays silent for the first moments of a degraded stream, so a normal handshake never flashes", () => {
    vi.useFakeTimers();
    const view = mount();

    setConnectionStatus("reconnecting");
    advance(DEGRADED_DELAY_MS - 1);

    expect(view.get('[role="status"]').textContent).toBe("");
  });

  it("announces reconnecting in the status region once the stream stays degraded", () => {
    vi.useFakeTimers();
    const view = mount();

    setConnectionStatus("reconnecting");
    advance(DEGRADED_DELAY_MS);

    expect(view.get('[role="status"]').textContent).toBe("Reconnecting");
  });

  it("renders the reconnecting notice as a warning pill", () => {
    vi.useFakeTimers();
    const view = mount();

    setConnectionStatus("reconnecting");
    advance(DEGRADED_DELAY_MS);

    expect(view.get('[role="status"] > span').dataset.tone).toBe("warning");
  });

  it("clears the notice the moment the stream recovers, without waiting out a delay", () => {
    vi.useFakeTimers();
    const view = mount();

    setConnectionStatus("reconnecting");
    advance(DEGRADED_DELAY_MS);
    setConnectionStatus("live");

    expect(view.get('[role="status"]').textContent).toBe("");
  });

  it("never shows the notice for a blip that recovers inside the delay", () => {
    vi.useFakeTimers();
    const view = mount();

    setConnectionStatus("reconnecting");
    advance(DEGRADED_DELAY_MS - 500);
    setConnectionStatus("live");
    advance(DEGRADED_DELAY_MS);

    expect(view.get('[role="status"]').textContent).toBe("");
  });

  it("picks up a status that was already degraded before the header mounted", () => {
    vi.useFakeTimers();
    setConnectionStatus("reconnecting");

    const view = mount();
    advance(DEGRADED_DELAY_MS);

    expect(view.get('[role="status"]').textContent).toBe("Reconnecting");
  });
});
