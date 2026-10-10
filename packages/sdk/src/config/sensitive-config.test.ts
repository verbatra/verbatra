import { describe, expect, it } from "vitest";
import { baseConfig } from "../test-support.js";
import { verbatraConfigSchema } from "./schema.js";

function parse(sensitiveData: unknown) {
  return verbatraConfigSchema.safeParse({ ...baseConfig(), sensitiveData });
}

describe("the sensitiveData config block", () => {
  it("is optional", () => {
    expect(verbatraConfigSchema.safeParse(baseConfig()).success).toBe(true);
  });

  it("accepts every mode and the full shape", () => {
    for (const mode of ["off", "warn", "block", "redact"]) {
      expect(parse({ mode }).success, mode).toBe(true);
    }
    expect(
      parse({
        mode: "redact",
        detectors: ["secret", "phone", "ip", "private-host"],
        patterns: ["Project\\s+Falcon"],
        allow: ["*@example.org"],
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown mode, detector, or key", () => {
    expect(parse({ mode: "strict" }).success).toBe(false);
    expect(parse({ mode: "warn", detectors: ["name"] }).success).toBe(false);
    expect(parse({ mode: "warn", sensitivePatterns: [] }).success).toBe(false);
    expect(parse({}).success).toBe(false);
  });

  it("rejects a pattern that is not a valid regular expression, naming the key", () => {
    const result = parse({ mode: "warn", patterns: ["Falcon", "(unclosed"] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["sensitiveData", "patterns", 1]);
    expect(result.error?.issues[0]?.message).toContain("valid regular expressions");
  });

  it.each([
    ["(a+)+$", "must not repeat more than once a group that holds a quantifier or an alternative"],
    [
      "(a|aa)*b",
      "must not repeat more than once a group that holds a quantifier or an alternative",
    ],
    [
      "(?:a?){30}x",
      "must not repeat more than once a group that holds a quantifier or an alternative",
    ],
    ["\\w*\\w*x", "at most one unbounded repeat"],
    ["\\w{0,64}\\w*x", "may branch at most 4 ways beside an unbounded repeat"],
  ])(
    "rejects the slow pattern %s before it ever runs, naming the rule and the key",
    (pattern, rule) => {
      const result = parse({ mode: "warn", patterns: [pattern] });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["sensitiveData", "patterns", 0]);
      expect(result.error?.issues[0]?.message).toContain(rule);
    },
  );

  it("rejects an empty pattern or allow entry", () => {
    expect(parse({ mode: "warn", patterns: [""] }).success).toBe(false);
    expect(parse({ mode: "warn", allow: [""] }).success).toBe(false);
  });
});
