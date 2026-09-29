import { cpuScalingRatio, LINEAR_MAX_RATIO, LINEAR_SCALE } from "@verbatra/config/scaling";
import { describe, expect, it } from "vitest";
import { libreTranslateConfigSchema } from "./config.js";
import { libreTranslateUrl } from "./endpoint.js";

describe("libreTranslateConfigSchema", () => {
  it("requires an http or https baseUrl", () => {
    expect(libreTranslateConfigSchema.safeParse({}).success).toBe(false);
    expect(libreTranslateConfigSchema.safeParse({ baseUrl: "localhost:5000" }).success).toBe(false);
    expect(libreTranslateConfigSchema.safeParse({ baseUrl: "file:///tmp" }).success).toBe(false);
    expect(
      libreTranslateConfigSchema.parse({
        baseUrl: "http://localhost:5000",
        requestTimeoutMs: 30_000,
        localeMap: { "de-CH": "de" },
      }),
    ).toEqual({
      baseUrl: "http://localhost:5000",
      requestTimeoutMs: 30_000,
      localeMap: { "de-CH": "de" },
    });
  });

  it("has no field for an API key", () => {
    expect(
      libreTranslateConfigSchema.strict().safeParse({ baseUrl: "http://x.test", apiKey: "k" })
        .success,
    ).toBe(false);
  });
});

describe("libreTranslateUrl", () => {
  it("joins the endpoint path to the base URL, with or without a trailing slash", () => {
    expect(libreTranslateUrl("http://localhost:5000", "translate")).toBe(
      "http://localhost:5000/translate",
    );
    expect(libreTranslateUrl("https://lt.example.test/api//", "languages")).toBe(
      "https://lt.example.test/api/languages",
    );
  });

  it("keeps slashes that are not trailing", () => {
    expect(libreTranslateUrl("http://lt.example.test//api/", "translate")).toBe(
      "http://lt.example.test//api/translate",
    );
    expect(libreTranslateUrl("///", "languages")).toBe("/languages");
  });

  it("trims a run of slashes followed by a non-slash in linear time", () => {
    const build = (n: number) => `http://${"/".repeat(n)}x`;
    const small = build(20_000);
    const large = build(20_000 * LINEAR_SCALE);

    expect(libreTranslateUrl(large, "translate")).toBe(`${large}/translate`);
    expect(
      cpuScalingRatio((baseUrl: string) => libreTranslateUrl(baseUrl, "translate"), small, large),
    ).toBeLessThan(LINEAR_MAX_RATIO);
  });

  it("trims a long trailing slash run in linear time", () => {
    const build = (n: number) => `http://lt.example.test${"/".repeat(n)}`;
    const small = build(20_000);
    const large = build(20_000 * LINEAR_SCALE);

    expect(libreTranslateUrl(large, "languages")).toBe("http://lt.example.test/languages");
    expect(
      cpuScalingRatio((baseUrl: string) => libreTranslateUrl(baseUrl, "languages"), small, large),
    ).toBeLessThan(LINEAR_MAX_RATIO);
  });
});
