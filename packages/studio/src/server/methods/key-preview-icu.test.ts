import type { LoadedConfig, VerbatraConfig } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { baseStudioConfig } from "../test-support.js";
import { keyPreviewIcuHandler } from "./key-preview-icu.js";

function deps(overrides: Partial<VerbatraConfig> = {}): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: baseStudioConfig({
      format: "next-intl-json",
      targetLocales: ["de", "ar"],
      ...overrides,
    }),
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: "/project" };
}

describe("keyPreviewIcuHandler", () => {
  it("renders one row per plural category of a configured locale", async () => {
    const result = await keyPreviewIcuHandler(
      { locale: "ar", value: "{n, plural, one {# item} other {# items}}" },
      deps(),
    );

    expect(result).toMatchObject({ supported: true, valid: true });
    expect(result.supported && result.valid && result.rows.length).toBeGreaterThanOrEqual(2);
  });

  it("accepts the source locale", async () => {
    const result = await keyPreviewIcuHandler({ locale: "en", value: "Hello {name}" }, deps());

    expect(result).toMatchObject({ supported: true, valid: true });
  });

  it.each(["fr", "", "__proto__", "constructor", "toString", "de ", "DE"])(
    "refuses the locale %j that is not configured",
    async (locale) => {
      await expect(keyPreviewIcuHandler({ locale, value: "x" }, deps())).rejects.toMatchObject({
        name: "SdkError",
        code: "UNKNOWN_LOCALE",
      });
    },
  );

  it("answers not-icu for a format without ICU syntax", async () => {
    const result = await keyPreviewIcuHandler(
      { locale: "de", value: "{n, plural, one {a} other {b}}" },
      deps({ format: "i18next-json" }),
    );

    expect(result).toEqual({ supported: false, reason: "not-icu" });
  });

  it("answers a parse failure as a structured result, never a throw", async () => {
    const result = await keyPreviewIcuHandler(
      { locale: "de", value: "{n, plural, one {a" },
      deps(),
    );

    expect(result).toEqual({ supported: true, valid: false, reason: "invalid-message" });
  });

  it("reads an argument sample by its own property only", async () => {
    const args = JSON.parse('{"__proto__": "x", "constructor": 2, "n": 5}') as Record<
      string,
      string | number
    >;

    const result = await keyPreviewIcuHandler(
      { locale: "de", value: "{n, plural, one {# eins} other {# viele}} {constructor}", args },
      deps(),
    );

    expect(result).toMatchObject({ supported: true, valid: true });
  });

  it("returns hostile markup as plain text segments", async () => {
    const result = await keyPreviewIcuHandler(
      { locale: "de", value: "<b>{name}</b><script>alert(1)</script>" },
      deps(),
    );

    const segments = result.supported && result.valid ? (result.rows[0]?.segments ?? []) : [];
    expect(segments.map((segment) => segment.kind)).toEqual([
      "tag",
      "argument",
      "tag",
      "tag",
      "text",
      "tag",
    ]);
    expect(segments.every((segment) => typeof segment.text === "string")).toBe(true);
  });
});
