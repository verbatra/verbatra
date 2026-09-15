import { describe, expect, it } from "vitest";
import { toMaxLengthMap } from "./max-length.js";

describe("toMaxLengthMap", () => {
  it("returns undefined when no budgets are configured, so lookups cost nothing", () => {
    expect(toMaxLengthMap(undefined)).toBeUndefined();
  });

  it("returns undefined for an empty budget block", () => {
    expect(toMaxLengthMap({})).toBeUndefined();
  });

  it("maps each configured key to its budget", () => {
    const budgets = toMaxLengthMap({ "nav.title": 24, "cta.submit": 12 });

    expect(budgets?.get("nav.title")).toBe(24);
    expect(budgets?.get("cta.submit")).toBe(12);
    expect(budgets?.size).toBe(2);
  });

  it("does not resolve an inherited object property as a budget", () => {
    const budgets = toMaxLengthMap({ "nav.title": 24 });

    expect(budgets?.get("toString")).toBeUndefined();
    expect(budgets?.get("__proto__")).toBeUndefined();
  });
});
