import { cpuScalingRatio, LINEAR_MAX_RATIO } from "@verbatra/config/scaling";
import { describe, expect, it } from "vitest";
import { extractDoubleBracePlaceholders, extractI18nextPlaceholders } from "./placeholders.js";

describe("extractI18nextPlaceholders", () => {
  it("extracts a single placeholder verbatim", () => {
    expect(extractI18nextPlaceholders("Hello {{name}}")).toEqual(["{{name}}"]);
  });

  it("extracts multiple placeholders in order", () => {
    expect(extractI18nextPlaceholders("{{a}} and {{b}}")).toEqual(["{{a}}", "{{b}}"]);
  });

  it("returns an empty array when there are no placeholders", () => {
    expect(extractI18nextPlaceholders("plain text")).toEqual([]);
  });

  it("preserves every occurrence of a repeated placeholder in document order", () => {
    expect(extractI18nextPlaceholders("{{count}} of {{count}}")).toEqual([
      "{{count}}",
      "{{count}}",
    ]);
  });

  it("keeps formatted placeholders verbatim", () => {
    expect(extractI18nextPlaceholders("{{val, number}}")).toEqual(["{{val, number}}"]);
  });

  it("extracts a $t() nesting reference", () => {
    expect(extractI18nextPlaceholders("see $t(common.foo) for details")).toEqual([
      "$t(common.foo)",
    ]);
  });

  it("extracts a $t() reference with options verbatim", () => {
    expect(extractI18nextPlaceholders('$t(common.foo, {"count": 3})')).toEqual([
      '$t(common.foo, {"count": 3})',
    ]);
  });

  it("extracts braces and $t() together in document order, with multiplicity", () => {
    expect(extractI18nextPlaceholders("$t(a) {{name}} $t(a)")).toEqual([
      "$t(a)",
      "{{name}}",
      "$t(a)",
    ]);
  });

  it("stays linear on a long run of unclosed $t(", () => {
    const hostile = "$t(".repeat(200_000);
    expect(extractI18nextPlaceholders(hostile)).toEqual([]);
    expect(cpuScalingRatio(extractI18nextPlaceholders, "$t(".repeat(25_000), hostile)).toBeLessThan(
      LINEAR_MAX_RATIO,
    );
  });
});

describe("extractDoubleBracePlaceholders (shared with ngx-translate)", () => {
  it("extracts double-brace interpolation with multiplicity", () => {
    expect(extractDoubleBracePlaceholders("{{count}} of {{count}}")).toEqual([
      "{{count}}",
      "{{count}}",
    ]);
  });

  it("does not extract $t() nesting (ngx-translate has no nesting)", () => {
    expect(extractDoubleBracePlaceholders("see $t(common.foo) {{name}}")).toEqual(["{{name}}"]);
  });
});
