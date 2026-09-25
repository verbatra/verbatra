import { cpuScalingRatio, LINEAR_MAX_RATIO } from "@verbatra/config/scaling";
import { describe, expect, it } from "vitest";
import { extractVueI18nPlaceholders } from "./placeholders.js";

describe("extractVueI18nPlaceholders", () => {
  it("extracts a single named placeholder", () => {
    expect(extractVueI18nPlaceholders("hello {name}")).toEqual(["{name}"]);
  });

  it("extracts list-interpolation placeholders", () => {
    expect(extractVueI18nPlaceholders("{0} and {1}")).toEqual(["{0}", "{1}"]);
  });

  it("preserves every occurrence of a repeated placeholder in document order", () => {
    expect(extractVueI18nPlaceholders("{count} of {count}")).toEqual(["{count}", "{count}"]);
  });

  it("returns an empty array when there is no interpolation", () => {
    expect(extractVueI18nPlaceholders("plain text")).toEqual([]);
  });

  it("does not treat linked messages as placeholders", () => {
    expect(extractVueI18nPlaceholders("see @:other.key for details")).toEqual([]);
  });

  it("does not extract a phantom token from double-brace text", () => {
    expect(extractVueI18nPlaceholders("Hello {{name}}")).toEqual([]);
  });

  it("normalizes whitespace inside braces to a canonical token", () => {
    expect(extractVueI18nPlaceholders("hi { name }")).toEqual(["{name}"]);
    expect(extractVueI18nPlaceholders("{  count\t}")).toEqual(["{count}"]);
  });

  it("does not treat literal interpolation as a placeholder", () => {
    expect(extractVueI18nPlaceholders("{account}{'@'}{domain}")).toEqual(["{account}", "{domain}"]);
  });

  it("accepts the full vue-i18n named-key character set", () => {
    expect(extractVueI18nPlaceholders("{user-id} {val$2} {_x}")).toEqual([
      "{user-id}",
      "{val$2}",
      "{_x}",
    ]);
  });

  it("does not treat literal braces with non-key content as placeholders", () => {
    expect(extractVueI18nPlaceholders("use {curly braces} here")).toEqual([]);
  });

  it("extracts across pipe-separated plural forms", () => {
    expect(extractVueI18nPlaceholders("no apples | one apple | {count} apples")).toEqual([
      "{count}",
    ]);
  });

  it("stays linear on adversarial input", () => {
    const hostile = "{".repeat(200_000);
    expect(extractVueI18nPlaceholders(hostile)).toEqual([]);
    expect(cpuScalingRatio(extractVueI18nPlaceholders, "{".repeat(25_000), hostile)).toBeLessThan(
      LINEAR_MAX_RATIO,
    );
  });
});
