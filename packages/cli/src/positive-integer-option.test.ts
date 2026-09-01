import { describe, expect, it } from "vitest";
import { CliUsageError } from "./cli-usage-error.js";
import { parsePositiveIntegerOption } from "./positive-integer-option.js";

describe("parsePositiveIntegerOption", () => {
  const spec = { code: "INVALID_TEST_OPTION", describe: "test option must be valid", min: 1 };

  it("returns undefined when the value is undefined", () => {
    expect(parsePositiveIntegerOption(undefined, spec)).toBeUndefined();
  });

  it("returns the parsed integer for a value within range", () => {
    expect(parsePositiveIntegerOption("5", spec)).toBe(5);
  });

  it("rejects a value below min", () => {
    expect(() => parsePositiveIntegerOption("0", spec)).toThrow(CliUsageError);
  });

  it("accepts a value exactly at max", () => {
    expect(parsePositiveIntegerOption("10", { ...spec, max: 10 })).toBe(10);
  });

  it("rejects a value above max with a CliUsageError carrying the given code", () => {
    let error: unknown;
    try {
      parsePositiveIntegerOption("11", { ...spec, max: 10 });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(CliUsageError);
    expect((error as CliUsageError).code).toBe("INVALID_TEST_OPTION");
    expect((error as CliUsageError).message).toContain("test option must be valid");
    expect((error as CliUsageError).message).toContain('"11"');
  });

  it("rejects an absurdly large all-digit value that exceeds max", () => {
    expect(() =>
      parsePositiveIntegerOption("100000000000000000000", { ...spec, max: 1000 }),
    ).toThrow(CliUsageError);
  });

  it("with no max configured, an arbitrarily large value is still accepted", () => {
    expect(parsePositiveIntegerOption("999999", spec)).toBe(999999);
  });
});
