// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readAnalyticsPreference,
  setAnalyticsOptOut,
  trackUmamiEvent,
  UMAMI_OPT_OUT_KEY,
} from "./umami";

describe("trackUmamiEvent", () => {
  afterEach(() => {
    window.umami = undefined;
  });

  it("calls window.umami.track with the event name and data", () => {
    const track = vi.fn();
    window.umami = { track };

    trackUmamiEvent("copy-install-command", { manager: "pnpm" });

    expect(track).toHaveBeenCalledWith("copy-install-command", { manager: "pnpm" });
  });

  it("calls window.umami.track with no data when omitted", () => {
    const track = vi.fn();
    window.umami = { track };

    trackUmamiEvent("copy-ai-prompt");

    expect(track).toHaveBeenCalledWith("copy-ai-prompt", undefined);
  });

  it("does not throw when the tracker script has not loaded yet", () => {
    window.umami = undefined;

    expect(() => trackUmamiEvent("locale-switch", { to: "de", from: "en" })).not.toThrow();
  });
});

function stubDoNotTrack(source: "window" | "navigator", property: string, value: unknown): void {
  const target = source === "window" ? window : window.navigator;
  Object.defineProperty(target, property, { configurable: true, value });
}

function clearDoNotTrack(): void {
  for (const property of ["doNotTrack", "msDoNotTrack"]) {
    Reflect.deleteProperty(window, property);
    Reflect.deleteProperty(window.navigator, property);
  }
}

describe("analytics preference", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    clearDoNotTrack();
  });

  it("uses the opt-out key the Umami tracker reads", () => {
    expect(UMAMI_OPT_OUT_KEY).toBe("umami.disabled");
  });

  it("reports counted visits when nothing opts out", () => {
    expect(readAnalyticsPreference()).toBe("counted");
  });

  it("stores the opt-out key when opting out and removes it when opting back in", () => {
    expect(setAnalyticsOptOut(true)).toBe("opted-out");
    expect(window.localStorage.getItem(UMAMI_OPT_OUT_KEY)).toBe("1");

    expect(setAnalyticsOptOut(false)).toBe("counted");
    expect(window.localStorage.getItem(UMAMI_OPT_OUT_KEY)).toBeNull();
  });

  it("treats any non-empty stored value as an opt-out, as the tracker does", () => {
    window.localStorage.setItem(UMAMI_OPT_OUT_KEY, "0");

    expect(readAnalyticsPreference()).toBe("opted-out");
  });

  it("treats an empty stored value as no opt-out, because the tracker ignores it", () => {
    window.localStorage.setItem(UMAMI_OPT_OUT_KEY, "");

    expect(readAnalyticsPreference()).toBe("counted");
  });

  it.each([
    ["window", "doNotTrack", "1"],
    ["navigator", "doNotTrack", "1"],
    ["navigator", "doNotTrack", "yes"],
    ["navigator", "msDoNotTrack", "1"],
    ["window", "doNotTrack", 1],
  ] as const)("reports Do Not Track from %s.%s = %s", (source, property, value) => {
    stubDoNotTrack(source, property, value);

    expect(readAnalyticsPreference()).toBe("do-not-track");
  });

  it.each(["0", "no", "unspecified", null])("ignores a Do Not Track value of %s", (value) => {
    stubDoNotTrack("navigator", "doNotTrack", value);

    expect(readAnalyticsPreference()).toBe("counted");
  });

  it("lets an explicit opt-out take precedence over Do Not Track", () => {
    stubDoNotTrack("navigator", "doNotTrack", "1");

    expect(setAnalyticsOptOut(true)).toBe("opted-out");
    expect(setAnalyticsOptOut(false)).toBe("do-not-track");
  });

  it("reports unavailable when the browser refuses access to local storage", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(readAnalyticsPreference()).toBe("unavailable");
    expect(setAnalyticsOptOut(true)).toBe("unavailable");
  });

  it("reports unavailable when reading or writing the key throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    expect(readAnalyticsPreference()).toBe("unavailable");
    expect(setAnalyticsOptOut(true)).toBe("unavailable");
  });
});
