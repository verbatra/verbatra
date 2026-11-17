// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDocumentCookie, setDocumentCookie } from "../test-support/document-cookie";
import {
  announceChoice,
  browserChoice,
  browserHasSignal,
  CHOICE_CHANNEL,
  CHOICE_EVENT,
  onChoiceInOtherWindow,
} from "./analytics-client";

class FakeChannel {
  static readonly open: FakeChannel[] = [];
  onmessage: (() => void) | null = null;
  closed = false;
  posted = 0;
  constructor(readonly name: string) {
    FakeChannel.open.push(this);
  }
  postMessage(): void {
    this.posted += 1;
    for (const other of FakeChannel.open) {
      if (other !== this && !other.closed && other.name === this.name) other.onmessage?.();
    }
  }
  close(): void {
    this.closed = true;
  }
}

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
  vi.unstubAllGlobals();
  FakeChannel.open.length = 0;
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

describe("the cross-window choice signal", () => {
  it("tells a listener in another window that a choice was made", () => {
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const listener = vi.fn();
    const stop = onChoiceInOtherWindow(listener);
    announceChoice();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(FakeChannel.open.every((channel) => channel.name === CHOICE_CHANNEL)).toBe(true);
    stop();
    announceChoice();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("closes the sending channel after each announcement", () => {
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    announceChoice();
    expect(FakeChannel.open.map((channel) => [channel.posted, channel.closed])).toEqual([
      [1, true],
    ]);
  });

  it("does nothing where BroadcastChannel does not exist", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const listener = vi.fn();
    expect(() => onChoiceInOtherWindow(listener)()).not.toThrow();
    expect(() => announceChoice()).not.toThrow();
  });

  it("survives a channel that cannot be opened", () => {
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        constructor() {
          throw new Error("blocked");
        }
      },
    );
    expect(() => onChoiceInOtherWindow(vi.fn())()).not.toThrow();
    expect(() => announceChoice()).not.toThrow();
  });
});
