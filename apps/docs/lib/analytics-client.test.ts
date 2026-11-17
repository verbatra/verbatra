// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDocumentCookie, setDocumentCookie } from "../test-support/document-cookie";
import { announceChoice, browserChoice, browserHasSignal, CHOICE_EVENT } from "./analytics-client";

function clearCookies(): void {
  for (const name of ["verbatra_analytics", "verbatra_analytics_optout"]) {
    clearDocumentCookie(name);
  }
}

function setNavigator(values: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(values)) {
    Object.defineProperty(navigator, name, { value, configurable: true });
  }
}

afterEach(() => {
  clearCookies();
  for (const name of ["globalPrivacyControl", "doNotTrack", "msDoNotTrack"]) {
    Reflect.deleteProperty(navigator, name);
  }
  Reflect.deleteProperty(window, "doNotTrack");
  vi.restoreAllMocks();
});

describe("browserChoice", () => {
  it("is undecided without a cookie", () => {
    expect(browserChoice()).toBeUndefined();
  });

  it("reads the choice cookie", () => {
    setDocumentCookie("verbatra_analytics", "full");
    expect(browserChoice()).toBe("full");
  });

  it("ignores a value outside the allowlist", () => {
    setDocumentCookie("verbatra_analytics", "maybe");
    expect(browserChoice()).toBeUndefined();
  });
});

describe("browserHasSignal", () => {
  it("is false without a signal", () => {
    expect(browserHasSignal()).toBe(false);
  });

  it("reads global privacy control", () => {
    setNavigator({ globalPrivacyControl: true });
    expect(browserHasSignal()).toBe(true);
  });

  it.each([
    ["navigator.doNotTrack", () => setNavigator({ doNotTrack: "1" })],
    ["navigator.msDoNotTrack", () => setNavigator({ msDoNotTrack: "1" })],
    [
      "window.doNotTrack",
      () => Object.defineProperty(window, "doNotTrack", { value: "1", configurable: true }),
    ],
  ])("reads do not track from %s", (_name, arrange) => {
    arrange();
    expect(browserHasSignal()).toBe(true);
  });

  it("ignores a do not track value of 0", () => {
    setNavigator({ doNotTrack: "0" });
    expect(browserHasSignal()).toBe(false);
  });
});

describe("announceChoice", () => {
  it("dispatches the choice event on the window", () => {
    const listener = vi.fn();
    window.addEventListener(CHOICE_EVENT, listener);
    announceChoice();
    window.removeEventListener(CHOICE_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
