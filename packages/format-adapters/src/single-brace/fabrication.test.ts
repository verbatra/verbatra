import { cpuScalingRatio, LINEAR_MAX_RATIO } from "@verbatra/config/scaling";
import { describe, expect, it } from "vitest";
import {
  extractDoubleBracePlaceholders,
  extractI18nextPlaceholders,
} from "../i18next/placeholders.js";
import { createSingleBraceFabricationComparator } from "./fabrication.js";

const compare = createSingleBraceFabricationComparator(extractI18nextPlaceholders);

describe("createSingleBraceFabricationComparator: the format's own placeholders", () => {
  it("accepts a translation that keeps every double-brace placeholder", () => {
    expect(compare("Hello {{name}}", "Hallo {{name}}")).toEqual({
      matches: true,
      missing: [],
      extra: [],
      reordered: false,
    });
  });

  it("still reports a dropped double-brace placeholder as missing", () => {
    expect(compare("Hello {{name}}", "Hallo")).toMatchObject({
      matches: false,
      missing: ["{{name}}"],
      extra: [],
    });
  });

  it("still reports an invented double-brace placeholder as extra", () => {
    expect(compare("Hello", "Hallo {{name}}")).toMatchObject({
      matches: false,
      missing: [],
      extra: ["{{name}}"],
    });
  });

  it("still reports a reorder on an otherwise matching value", () => {
    expect(compare("{{a}} {{b}}", "{{b}} {{a}}")).toEqual({
      matches: true,
      missing: [],
      extra: [],
      reordered: true,
    });
  });
});

describe("createSingleBraceFabricationComparator: invented single-brace tokens", () => {
  it("rejects a single-brace token altered into one the source never had", () => {
    expect(compare("Hello {name}", "Ciao {nome}")).toEqual({
      matches: false,
      missing: [],
      extra: ["{nome}"],
      reordered: false,
    });
  });

  it("rejects a single-brace token fabricated beside a kept one", () => {
    expect(compare("Order {orderId}", "Ordine {orderId} {evilInjected}")).toMatchObject({
      matches: false,
      extra: ["{evilInjected}"],
    });
  });

  it("rejects a single-brace token injected into a token-free source", () => {
    expect(compare("Your balance is available", "Il tuo saldo e {stolenSecret}")).toMatchObject({
      matches: false,
      extra: ["{stolenSecret}"],
    });
  });

  it("reports every distinct invented token once, sorted, alongside the format's own extras", () => {
    expect(compare("Hi", "Ciao {{name}} {b} {a} {a}")).toMatchObject({
      matches: false,
      extra: ["{a}", "{b}", "{{name}}"],
    });
  });

  it("sees through whitespace padding used to disguise an invented token", () => {
    expect(compare("Hello {name}", "Ciao {  nome\t}")).toMatchObject({
      matches: false,
      extra: ["{nome}"],
    });
  });
});

describe("createSingleBraceFabricationComparator: what it deliberately allows", () => {
  it("accepts a translation that drops a single-brace token, which is literal text here", () => {
    expect(compare("You have {count} items", "Hai articoli nel carrello")).toEqual({
      matches: true,
      missing: [],
      extra: [],
      reordered: false,
    });
  });

  it("accepts a single-brace token repeated more often than the source has it", () => {
    expect(compare("Hi {name}", "Ciao {name}, {name}")).toMatchObject({ matches: true });
  });

  it("accepts a single-brace token carried over from a double-brace-padded source", () => {
    expect(compare("{{greeting}} {name}", "{{greeting}} {name}")).toMatchObject({ matches: true });
  });

  it("does not read a phantom single-brace token out of double-brace interpolation", () => {
    expect(compare("Hello", "Hallo {{name}}")).toMatchObject({ extra: ["{{name}}"] });
  });

  it("does not treat a formatted double-brace placeholder as an invented token", () => {
    expect(compare("{{val, number}}", "{{val, number}}")).toMatchObject({ matches: true });
  });
});

describe("createSingleBraceFabricationComparator: shared by the $t()-free formats", () => {
  const compareFlat = createSingleBraceFabricationComparator(extractDoubleBracePlaceholders);

  it("guards fabrication without guarding $t() nesting", () => {
    expect(compareFlat("see $t(a) {{name}}", "vedi $t(b) {{name}}")).toMatchObject({
      matches: true,
    });
    expect(compareFlat("see $t(a) {{name}}", "vedi $t(a) {{name}} {evil}")).toMatchObject({
      matches: false,
      extra: ["{evil}"],
    });
  });

  it("stays linear on an adversarial pair of values", () => {
    const hostile = "{".repeat(200_000);
    expect(compareFlat(hostile, hostile)).toMatchObject({ matches: true });
    const compareSelf = (value: string) => compareFlat(value, value);
    expect(cpuScalingRatio(compareSelf, "{".repeat(25_000), hostile)).toBeLessThan(
      LINEAR_MAX_RATIO,
    );
  });
});
