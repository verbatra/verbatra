// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "./analytics-events";

afterEach(() => {
  Reflect.deleteProperty(window, "umami");
  vi.restoreAllMocks();
});

describe("trackEvent", () => {
  it("passes the event name and data to the tracker", () => {
    const track = vi.fn();
    Reflect.set(window, "umami", { track });
    trackEvent("copy_code", { surface: "command-row" });
    expect(track).toHaveBeenCalledExactlyOnceWith("copy_code", { surface: "command-row" });
  });

  it("does nothing while the tracker is absent", () => {
    expect(() => trackEvent("cta_click", { id: "hero-quickstart", locale: "en" })).not.toThrow();
  });

  it.each([[undefined], [null], [{}], [{ track: "no" }], ["umami"]])(
    "does nothing for a tracker shaped like %j",
    (tracker) => {
      Reflect.set(window, "umami", tracker);
      expect(() => trackEvent("copy_code", { surface: "ai-prompt" })).not.toThrow();
    },
  );

  it("never throws and never logs when the tracker throws", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    Reflect.set(window, "umami", {
      track: () => {
        throw new Error("blocked");
      },
    });
    expect(() => trackEvent("outbound_click", { target: "github", from: "footer" })).not.toThrow();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
