import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { baseConfig } from "../test-support.js";
import { assertTargetLocale, selectLocales } from "./select-locales.js";

const cfg = (targetLocales: readonly string[]): VerbatraConfig =>
  baseConfig({ targetLocales: [...targetLocales] });

describe("selectLocales", () => {
  it("returns all configured targets when requested is undefined", () => {
    const config = cfg(["de", "fr", "es"]);
    expect(selectLocales(config, undefined)).toEqual(["de", "fr", "es"]);
    expect(selectLocales(config, undefined)).toBe(config.targetLocales);
  });

  it("returns the requested subset in config order, not request order", () => {
    const config = cfg(["de", "fr", "es"]);
    expect(selectLocales(config, ["es", "de"])).toEqual(["de", "es"]);
  });

  it("throws UNKNOWN_LOCALE naming a single unknown locale and the configured targets", () => {
    const config = cfg(["de", "fr"]);
    try {
      selectLocales(config, ["es"]);
      expect.unreachable("expected selectLocales to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SdkError);
      const sdkError = error as SdkError;
      expect(sdkError.code).toBe("UNKNOWN_LOCALE");
      expect(sdkError.message).toContain("locale");
      expect(sdkError.message).toContain("es");
      expect(sdkError.message).toContain("de, fr");
    }
  });

  it("throws UNKNOWN_LOCALE on a mixed list, naming only the unknown entries in input order", () => {
    const config = cfg(["de"]);
    try {
      selectLocales(config, ["de", "fr", "it"]);
      expect.unreachable("expected selectLocales to throw");
    } catch (error) {
      const sdkError = error as SdkError;
      expect(sdkError.code).toBe("UNKNOWN_LOCALE");
      expect(sdkError.message).toContain("locales");
      expect(sdkError.message).toContain("fr, it");
      expect(sdkError.message).not.toContain(": de,");
    }
  });

  it("keeps an explicit empty array as select-none and does not throw", () => {
    const config = cfg(["de", "fr"]);
    expect(selectLocales(config, [])).toEqual([]);
  });
});

describe("assertTargetLocale", () => {
  it("accepts a configured target locale", () => {
    expect(() => assertTargetLocale({ targetLocales: ["de", "fr"] }, "fr")).not.toThrow();
  });

  it("refuses the source locale and a case variant, which are not configured targets", () => {
    const config = cfg(["de"]);
    expect(() => assertTargetLocale(config, config.sourceLocale)).toThrow(SdkError);
    expect(() => assertTargetLocale(config, "DE")).toThrow(SdkError);
  });

  it("throws the exact error selectLocales throws for the same single locale", () => {
    const config = cfg(["de", "fr"]);
    const thrown = (run: () => unknown): SdkError => {
      try {
        run();
      } catch (error) {
        return error as SdkError;
      }
      throw new Error("expected a throw");
    };

    const fromAssert = thrown(() => assertTargetLocale(config, "it"));
    const fromSelect = thrown(() => selectLocales(config, ["it"]));

    expect(fromAssert).toBeInstanceOf(SdkError);
    expect(fromAssert.code).toBe("UNKNOWN_LOCALE");
    expect(fromAssert.message).toBe(fromSelect.message);
    expect(fromAssert.message).toBe(
      "Requested locale not in the configured target locales: it. Configured targets: de, fr.",
    );
  });
});
