import { describe, expect, it } from "vitest";
import {
  choiceCookie,
  expiredLegacyOptOutCookie,
  hasLegacyOptOut,
  hasPrivacySignal,
  readChoiceCookie,
} from "./analytics-choice";

describe("readChoiceCookie", () => {
  it.each(["full", "default", "off"] as const)("reads %s from the choice cookie", (choice) => {
    expect(readChoiceCookie(`theme=x; verbatra_analytics=${choice}; other=1`)).toBe(choice);
  });

  it.each([
    "verbatra_analytics=",
    "verbatra_analytics=FULL",
    "verbatra_analytics=on",
    "verbatra_analytics=full-extra",
    "x_verbatra_analytics=full",
    "verbatra_analytics_extra=full",
  ])("treats %s as undecided", (cookie) => {
    expect(readChoiceCookie(cookie)).toBeUndefined();
  });

  it.each([null, undefined, ""])("treats an absent cookie header (%s) as undecided", (header) => {
    expect(readChoiceCookie(header)).toBeUndefined();
  });

  it("ignores malformed pairs", () => {
    expect(readChoiceCookie(";;novalue; verbatra_analytics=default")).toBe("default");
  });
});

describe("readChoiceCookie and hasLegacyOptOut", () => {
  it("separates the new cookie from the legacy one", () => {
    expect(readChoiceCookie("verbatra_analytics_optout=1")).toBeUndefined();
    expect(readChoiceCookie("verbatra_analytics=off")).toBe("off");
    expect(hasLegacyOptOut("verbatra_analytics_optout=1")).toBe(true);
    expect(hasLegacyOptOut("verbatra_analytics=off")).toBe(false);
    expect(hasLegacyOptOut(null)).toBe(false);
  });
});

describe("hasPrivacySignal", () => {
  it("is true for global privacy control", () => {
    expect(hasPrivacySignal({ gpc: true })).toBe(true);
  });

  it.each(["1", "yes", true])("is true for do not track value %s", (dnt) => {
    expect(hasPrivacySignal({ dnt })).toBe(true);
  });

  it.each([
    {},
    { gpc: false },
    { dnt: "0" },
    { dnt: null },
    { gpc: undefined, dnt: "unspecified" },
  ])("is false without a signal (%j)", (signals) => {
    expect(hasPrivacySignal(signals)).toBe(false);
  });
});

describe("choiceCookie", () => {
  it("writes a readable, secure, lax, one year cookie for the site", () => {
    expect(choiceCookie("full")).toBe(
      "verbatra_analytics=full; Secure; SameSite=Lax; Path=/; Max-Age=31536000",
    );
  });

  it("never marks the choice cookie HttpOnly", () => {
    expect(choiceCookie("off")).not.toContain("HttpOnly");
  });
});

describe("expiredLegacyOptOutCookie", () => {
  it("clears the HttpOnly legacy cookie at the root path", () => {
    expect(expiredLegacyOptOutCookie()).toBe(
      "verbatra_analytics_optout=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
    );
  });
});
