import { previewIcuMessage } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { baseStudioConfig } from "../../server/test-support.js";
import {
  ICU_PREVIEW_ARGS_MAX_ENTRIES,
  ICU_PREVIEW_VALUE_MAX_LENGTH,
  keyPreviewIcuParamsSchema,
} from "./key-preview-icu.js";

function accepts(params: unknown): boolean {
  return keyPreviewIcuParamsSchema.safeParse(params).success;
}

describe("keyPreviewIcuParamsSchema", () => {
  it("accepts a locale, a value and string or number samples", () => {
    expect(accepts({ locale: "de", value: "x" })).toBe(true);
    expect(accepts({ locale: "de", value: "", args: { n: 12, name: "Ada" } })).toBe(true);
  });

  it.each([
    ["a path", { locale: "de", value: "x", path: "locales/de.json" }],
    ["a cwd", { locale: "de", value: "x", cwd: "/" }],
    ["a config", { locale: "de", value: "x", config: {} }],
    ["no locale", { value: "x" }],
    ["an empty locale", { locale: "", value: "x" }],
    ["no value", { locale: "de" }],
    ["a numeric value", { locale: "de", value: 1 }],
    ["a null value", { locale: "de", value: null }],
    ["an array of args", { locale: "de", value: "x", args: ["a"] }],
    ["a nested object sample", { locale: "de", value: "x", args: { n: { a: 1 } } }],
    ["an array sample", { locale: "de", value: "x", args: { n: [1] } }],
    ["a boolean sample", { locale: "de", value: "x", args: { n: true } }],
    ["a null sample", { locale: "de", value: "x", args: { n: null } }],
    ["an infinite sample", { locale: "de", value: "x", args: { n: Number.POSITIVE_INFINITY } }],
    ["a NaN sample", { locale: "de", value: "x", args: { n: Number.NaN } }],
    ["an over-long sample", { locale: "de", value: "x", args: { n: "x".repeat(257) } }],
    ["an empty argument name", { locale: "de", value: "x", args: { "": 1 } }],
    ["an over-long argument name", { locale: "de", value: "x", args: { ["n".repeat(129)]: 1 } }],
    ["a Map", { locale: "de", value: "x", args: new Map([["n", 1]]) }],
    ["a Date sample", { locale: "de", value: "x", args: { n: new Date(0) } }],
    ["a function sample", { locale: "de", value: "x", args: { n: () => 1 } }],
    ["an array as the params", [{ locale: "de", value: "x" }]],
  ])("refuses %s", (_name, params) => {
    expect(accepts(params)).toBe(false);
  });

  it("caps the value at the length the sdk accepts", () => {
    expect(accepts({ locale: "de", value: "x".repeat(ICU_PREVIEW_VALUE_MAX_LENGTH) })).toBe(true);
    expect(accepts({ locale: "de", value: "x".repeat(ICU_PREVIEW_VALUE_MAX_LENGTH + 1) })).toBe(
      false,
    );
  });

  it("caps the number of samples", () => {
    const entries = (count: number): Record<string, number> =>
      Object.fromEntries(Array.from({ length: count }, (_, index) => [`a${index}`, index]));

    expect(accepts({ locale: "de", value: "x", args: entries(ICU_PREVIEW_ARGS_MAX_ENTRIES) })).toBe(
      true,
    );
    expect(
      accepts({ locale: "de", value: "x", args: entries(ICU_PREVIEW_ARGS_MAX_ENTRIES + 1) }),
    ).toBe(false);
  });

  it("does not let a __proto__ key reach the parsed object's prototype", () => {
    const parsed = keyPreviewIcuParamsSchema.safeParse(
      JSON.parse('{"locale":"de","value":"x","args":{"__proto__":"polluted","constructor":3}}'),
    );

    expect(parsed.success).toBe(true);
    expect(Object.getPrototypeOf(parsed.data?.args)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("agrees with the sdk about where a value becomes too long", () => {
    const config = baseStudioConfig({ format: "next-intl-json" });
    const atCap = previewIcuMessage({
      config,
      locale: "de",
      value: "a".repeat(ICU_PREVIEW_VALUE_MAX_LENGTH),
    });
    const overCap = previewIcuMessage({
      config,
      locale: "de",
      value: "a".repeat(ICU_PREVIEW_VALUE_MAX_LENGTH + 1),
    });

    expect(atCap).toMatchObject({ valid: true });
    expect(overCap).toEqual({ supported: true, valid: false, reason: "too-long" });
  });
});
