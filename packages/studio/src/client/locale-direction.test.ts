import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let isRtlLocale: (tag: string) => boolean;

beforeEach(async () => {
  vi.resetModules();
  ({ isRtlLocale } = await import("./locale-direction.js"));
});

const RTL_TAGS = [
  "ar",
  "he",
  "fa",
  "ur",
  "ps",
  "sd",
  "ug",
  "yi",
  "dv",
  "ckb",
  "syr",
  "ku-Arab",
  "pa-Arab",
  "ks",
  "ff-Adlm",
  "nqo",
  "rhg",
  "prs",
  "ar-EG",
  "he_IL",
  "AR",
  "Ar-SA",
];

const LTR_TAGS = ["en", "de-DE", "ku", "sd-Deva", "ks-Deva", "pa", "az", "und", "zh-Hant", "ja"];

type TextInfoOverride = PropertyDescriptor | undefined;

const localePrototype = Intl.Locale.prototype as object;
const originals = new Map<string, TextInfoOverride>();

function override(
  name: "getTextInfo" | "textInfo" | "maximize",
  descriptor: PropertyDescriptor | undefined,
): void {
  if (!originals.has(name)) {
    originals.set(name, Object.getOwnPropertyDescriptor(localePrototype, name));
  }
  Reflect.deleteProperty(localePrototype, name);
  if (descriptor !== undefined) {
    Object.defineProperty(localePrototype, name, { configurable: true, ...descriptor });
  }
}

function withoutTextInfo(): void {
  override("getTextInfo", undefined);
  override("textInfo", undefined);
}

afterEach(() => {
  for (const [name, descriptor] of originals) {
    Reflect.deleteProperty(localePrototype, name);
    if (descriptor !== undefined) {
      Object.defineProperty(localePrototype, name, descriptor);
    }
  }
  originals.clear();
});

describe("isRtlLocale: engine text info", () => {
  it.each(RTL_TAGS)("treats %s as right to left", (tag) => {
    expect(isRtlLocale(tag)).toBe(true);
  });

  it.each(LTR_TAGS)("treats %s as left to right", (tag) => {
    expect(isRtlLocale(tag)).toBe(false);
  });

  it("trusts getTextInfo over the script when the engine provides it", () => {
    override("getTextInfo", { value: () => ({ direction: "rtl" }) });

    expect(isRtlLocale("en")).toBe(true);
  });

  it("reads the textInfo getter when getTextInfo is absent", () => {
    override("getTextInfo", undefined);
    override("textInfo", { get: () => ({ direction: "rtl" }) });

    expect(isRtlLocale("en")).toBe(true);
  });
});

describe("isRtlLocale: script fallback without text info", () => {
  it.each(RTL_TAGS)("treats %s as right to left from its likely script", (tag) => {
    withoutTextInfo();

    expect(isRtlLocale(tag)).toBe(true);
  });

  it.each(LTR_TAGS)("treats %s as left to right from its likely script", (tag) => {
    withoutTextInfo();

    expect(isRtlLocale(tag)).toBe(false);
  });

  it("falls back to the script when text info carries no usable direction", () => {
    override("getTextInfo", { value: () => ({}) });

    expect(isRtlLocale("yi")).toBe(true);
    expect(isRtlLocale("en")).toBe(false);
  });
});

describe("isRtlLocale: invalid input", () => {
  it.each(["", "not a locale", "-", "ar--EG", "x"])("treats %j as left to right", (tag) => {
    expect(isRtlLocale(tag)).toBe(false);
  });

  it("falls back to the script when reading its direction throws", () => {
    override("getTextInfo", {
      value: () => {
        throw new RangeError("unsupported");
      },
    });

    expect(isRtlLocale("ar")).toBe(true);
    expect(isRtlLocale("en")).toBe(false);
  });

  it("treats a locale as left to right when neither text info nor its script can be read", () => {
    const unsupported = (): never => {
      throw new RangeError("unsupported");
    };
    override("getTextInfo", { value: unsupported });
    override("maximize", { value: unsupported });

    expect(isRtlLocale("ar")).toBe(false);
  });
});

describe("isRtlLocale: caching", () => {
  it("answers a tag it has already resolved without asking the engine again", () => {
    expect(isRtlLocale("ar")).toBe(true);
    override("getTextInfo", { value: () => ({ direction: "ltr" }) });

    expect(isRtlLocale("ar")).toBe(true);
    expect(isRtlLocale("ar-EG")).toBe(false);
  });
});
