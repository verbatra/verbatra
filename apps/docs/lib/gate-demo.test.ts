import { describe, expect, it } from "vitest";
import { firstTargetLocale, fixtureValueOf } from "@/lib/gate-demo";

describe("the gate demo's fixture lookups", () => {
  it("throws, naming the key, when the fixture has no such key", () => {
    expect(() => fixtureValueOf("no.such.key")).toThrow(/no\.such\.key/);
  });

  it("throws when the fixture lists no target locale", () => {
    expect(() => firstTargetLocale([])).toThrow(/target locale/);
  });

  it("returns the fixture's value and first locale when they exist", () => {
    expect(fixtureValueOf("profile.greeting")).toBe("Welcome back, {name}!");
    expect(firstTargetLocale([{ locale: "de" }])).toBe("de");
  });
});
