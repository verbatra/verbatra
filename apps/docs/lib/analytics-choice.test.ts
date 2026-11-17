import { describe, expect, it } from "vitest";
import { hasObjectionCookie } from "./analytics-choice";

describe("hasObjectionCookie", () => {
  it("honours the off choice cookie an earlier visit may have set", () => {
    expect(hasObjectionCookie("theme=x; verbatra_analytics=off; other=1")).toBe(true);
  });

  it("honours the HttpOnly legacy opt-out cookie", () => {
    expect(hasObjectionCookie("verbatra_analytics_optout=1")).toBe(true);
  });

  it.each([
    "verbatra_analytics=full",
    "verbatra_analytics=default",
    "verbatra_analytics=",
    "verbatra_analytics=OFF",
    "verbatra_analytics=off-extra",
    "x_verbatra_analytics=off",
    "verbatra_analytics_optout=0",
    "verbatra_analytics_optout=",
    "theme=dark",
  ])("is not an objection: %s", (cookie) => {
    expect(hasObjectionCookie(cookie)).toBe(false);
  });

  it.each([null, undefined, ""])("is not an objection for an absent header (%s)", (header) => {
    expect(hasObjectionCookie(header)).toBe(false);
  });

  it("ignores malformed pairs", () => {
    expect(hasObjectionCookie(";;novalue; verbatra_analytics=off")).toBe(true);
  });
});
