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
});
