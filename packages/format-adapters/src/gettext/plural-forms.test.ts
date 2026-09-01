import { describe, expect, it } from "vitest";
import { defaultPluralFormsExpression, parseHeaderFields, parseNplurals } from "./plural-forms.js";

describe("parseHeaderFields", () => {
  it("parses Key: value pairs from a decoded header block", () => {
    const header = "Project-Id-Version: demo\nContent-Type: text/plain; charset=UTF-8\n";
    const fields = parseHeaderFields(header);
    expect(fields.get("Project-Id-Version")).toBe("demo");
    expect(fields.get("Content-Type")).toBe("text/plain; charset=UTF-8");
  });

  it("parses a Plural-Forms field", () => {
    const header = "Plural-Forms: nplurals=2; plural=(n != 1);\n";
    expect(parseHeaderFields(header).get("Plural-Forms")).toBe("nplurals=2; plural=(n != 1);");
  });

  it("ignores lines that are not Key: value pairs", () => {
    expect(parseHeaderFields("not a header line\n").size).toBe(0);
  });
});

describe("parseNplurals", () => {
  it.each([
    ["nplurals=2; plural=(n != 1);", 2],
    ["nplurals=1; plural=0;", 1],
    ["nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);", 3],
    ["nplurals = 4 ; plural=0;", 4],
  ] as const)("extracts nplurals from %j", (value, expected) => {
    expect(parseNplurals(value)).toBe(expected);
  });

  it("returns undefined when there is no nplurals field", () => {
    expect(parseNplurals("plural=0;")).toBeUndefined();
  });
});

describe("defaultPluralFormsExpression", () => {
  it("uses the universal one-form default", () => {
    expect(defaultPluralFormsExpression(1)).toBe("nplurals=1; plural=0;");
  });

  it("uses the universal two-form default", () => {
    expect(defaultPluralFormsExpression(2)).toBe("nplurals=2; plural=(n != 1);");
  });

  it("clamps to a safe in-range expression for three or more forms", () => {
    expect(defaultPluralFormsExpression(3)).toBe("nplurals=3; plural=(n < 2 ? n : 2);");
  });
});
