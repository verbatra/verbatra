import { describe, expect, it } from "vitest";
import { customFormatIdSchema, formatIdSchema, isCustomFormatId } from "./format-id.js";
import { SUPPORTED_FORMATS } from "./supported-format.js";

describe("isCustomFormatId", () => {
  it("accepts a prefixed kebab-case identifier", () => {
    expect(isCustomFormatId("custom:my-format")).toBe(true);
  });

  it("accepts a single-segment identifier", () => {
    expect(isCustomFormatId("custom:toml")).toBe(true);
  });

  it("accepts digits inside a segment", () => {
    expect(isCustomFormatId("custom:po2")).toBe(true);
  });

  it("rejects an identifier with no prefix", () => {
    expect(isCustomFormatId("my-format")).toBe(false);
  });

  it("rejects the bare prefix", () => {
    expect(isCustomFormatId("custom:")).toBe(false);
  });

  it("rejects an uppercase segment", () => {
    expect(isCustomFormatId("custom:MyFormat")).toBe(false);
  });

  it("rejects a second colon", () => {
    expect(isCustomFormatId("custom:a:b")).toBe(false);
  });

  it("rejects a leading hyphen", () => {
    expect(isCustomFormatId("custom:-toml")).toBe(false);
  });

  it("rejects a trailing hyphen", () => {
    expect(isCustomFormatId("custom:toml-")).toBe(false);
  });

  it("rejects a doubled hyphen", () => {
    expect(isCustomFormatId("custom:to--ml")).toBe(false);
  });

  it("rejects leading whitespace, so a padded value cannot slip through", () => {
    expect(isCustomFormatId(" custom:toml")).toBe(false);
  });

  it("rejects a trailing newline, so an anchored-end bypass cannot slip through", () => {
    expect(isCustomFormatId("custom:toml\n")).toBe(false);
  });

  it("classifies no built-in format as custom, so the two spaces cannot overlap", () => {
    expect(SUPPORTED_FORMATS.filter((format) => isCustomFormatId(format))).toEqual([]);
  });
});

describe("customFormatIdSchema", () => {
  it("parses a valid identifier", () => {
    expect(customFormatIdSchema.parse("custom:toml")).toBe("custom:toml");
  });

  it("rejects a built-in format name", () => {
    expect(customFormatIdSchema.safeParse("i18next-json").success).toBe(false);
  });

  it("names the prefix in the failure message", () => {
    const result = customFormatIdSchema.safeParse("toml");

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("custom:");
  });
});

describe("formatIdSchema", () => {
  it("accepts every built-in format", () => {
    expect(SUPPORTED_FORMATS.filter((format) => !formatIdSchema.safeParse(format).success)).toEqual(
      [],
    );
  });

  it("accepts a third-party identifier", () => {
    expect(formatIdSchema.parse("custom:toml")).toBe("custom:toml");
  });

  it("rejects an unknown bare name", () => {
    expect(formatIdSchema.safeParse("toml").success).toBe(false);
  });

  it("rejects a malformed third-party identifier", () => {
    expect(formatIdSchema.safeParse("custom:TOML").success).toBe(false);
  });
});

describe("the guard and the schema cannot drift apart", () => {
  const candidates = [
    "custom:toml",
    "custom:my-format",
    "custom:po2",
    "custom:",
    "custom:TOML",
    "custom:-toml",
    "custom:toml-",
    "custom:to--ml",
    "custom:a:b",
    " custom:toml",
    "custom:toml\n",
    "custom:toml ",
    "toml",
    "i18next-json",
    "",
  ] as const;

  it.each(candidates)("agrees on %j", (candidate) => {
    expect(isCustomFormatId(candidate)).toBe(customFormatIdSchema.safeParse(candidate).success);
  });
});
