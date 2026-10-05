import { describe, expect, it } from "vitest";
import { entriesWithheldByMasking, isMaskingProvider, MASKED_WIRES } from "./masked-wire.js";
import { entry } from "./test-support.js";

const plain = entry("plain", "Save");
const masked = entry("masked", "Hi {name}", ["{name}"]);
const icu = entry("icu", "{count, plural, one {# item} other {# items}}", ["{count}"]);
const markup = entry("markup", "Open <b>{name}</b>", ["{name}", "<b>", "</b>"]);
const spaced = entry("spaced", "Hi {name}\nbye", ["{name}"]);

function withheldKeys(provider: Parameters<typeof entriesWithheldByMasking>[0]): string[] {
  return entriesWithheldByMasking(provider, [plain, masked, icu, markup, spaced]).map(
    (item) => item.key,
  );
}

describe("entriesWithheldByMasking", () => {
  it("withholds what DeepL cannot mask: ICU syntax and placeholders beside markup", () => {
    expect(withheldKeys("deepl")).toEqual(["icu", "markup"]);
  });

  it("also withholds a Google value whose masked text holds a line break", () => {
    expect(withheldKeys("google-translate")).toEqual(["icu", "markup", "spaced"]);
  });

  it("keeps markup for LibreTranslate and withholds only ICU syntax", () => {
    expect(withheldKeys("libretranslate")).toEqual(["icu"]);
  });

  it("counts a foreign placeholder the SDK adds, as the provider does", () => {
    const foreign = entry("foreign", "Hi %s, {n, number}");
    expect(entriesWithheldByMasking("deepl", [foreign])).toEqual([]);
    expect(
      entriesWithheldByMasking("deepl", [foreign], new Map([["foreign", ["%s"]]])).map(
        (item) => item.key,
      ),
    ).toEqual(["foreign"]);
  });
});

describe("isMaskingProvider", () => {
  it("names exactly the providers that mask placeholders", () => {
    expect(Object.keys(MASKED_WIRES).filter(isMaskingProvider)).toEqual([
      "deepl",
      "google-translate",
      "libretranslate",
    ]);
    expect(isMaskingProvider("anthropic")).toBe(false);
  });

  it("passes LibreTranslate text through its wire unchanged", () => {
    expect(MASKED_WIRES.libretranslate.decode("x")).toBe("x");
  });
});
