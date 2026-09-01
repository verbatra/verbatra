import { describe, expect, it } from "vitest";
import { AdapterError } from "../errors.js";
import { assertValidResourceName } from "./names.js";

describe("assertValidResourceName", () => {
  it("accepts a name starting with a letter", () => {
    expect(() => assertValidResourceName("app_name", "string")).not.toThrow();
  });

  it("accepts a name starting with an underscore", () => {
    expect(() => assertValidResourceName("_hidden", "string")).not.toThrow();
  });

  it("accepts digits after the first character", () => {
    expect(() => assertValidResourceName("title2", "string")).not.toThrow();
  });

  it("rejects a name starting with a digit", () => {
    expect(() => assertValidResourceName("2fast", "string")).toThrow(AdapterError);
  });

  it("rejects a name containing a bracket, so a hostile name cannot occupy plural key space", () => {
    let thrown: unknown;
    try {
      assertValidResourceName("count[one]", "string");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AdapterError);
    expect((thrown as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("rejects a name containing a dot or a dash", () => {
    expect(() => assertValidResourceName("app.name", "string")).toThrow(AdapterError);
    expect(() => assertValidResourceName("app-name", "string")).toThrow(AdapterError);
  });

  it("rejects an empty name", () => {
    expect(() => assertValidResourceName("", "string")).toThrow(AdapterError);
  });

  it("names the bad value and the tag in the error message", () => {
    let thrown: unknown;
    try {
      assertValidResourceName("2bad", "plurals");
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toContain("2bad");
    expect((thrown as Error).message).toContain("<plurals");
  });
});
