import { describe, expect, it } from "vitest";
import { baseConfig } from "../test-support.js";
import { verbatraConfigSchema } from "./schema.js";

function deeplConfig(localeMap: Record<string, unknown>) {
  return baseConfig({
    sourceLocale: "en-US",
    targetLocales: ["zh-Hant", "pt-BR"],
    provider: { id: "deepl", options: { localeMap } as { localeMap: Record<string, string> } },
  });
}

function issuesOf(input: unknown): ReadonlyArray<{ path: string; message: string }> {
  const result = verbatraConfigSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

describe("verbatraConfigSchema: provider.options.localeMap", () => {
  it("accepts keys naming the source locale and target locales", () => {
    const parsed = verbatraConfigSchema.parse(deeplConfig({ "en-US": "EN", "zh-Hant": "ZH-HANT" }));
    expect(parsed.provider.options).toEqual({ localeMap: { "en-US": "EN", "zh-Hant": "ZH-HANT" } });
  });

  it("stays optional on every machine provider", () => {
    expect(verbatraConfigSchema.safeParse(baseConfig()).success).toBe(true);
  });

  it("is accepted on an LLM provider too", () => {
    const config = baseConfig({
      provider: {
        id: "anthropic",
        options: { model: "m", maxTokens: 1, localeMap: { de: "German (de)" } },
      },
    });
    expect(verbatraConfigSchema.safeParse(config).success).toBe(true);
  });

  it("rejects a key that is not a configured locale, naming the key at its own path", () => {
    expect(issuesOf(deeplConfig({ fr: "FR", "zh-Hant": "ZH-HANT" }))).toEqual([
      {
        path: "provider.options.localeMap.fr",
        message: expect.stringContaining('"fr" is not a configured locale'),
      },
    ]);
  });

  it("reports every unknown key, not only the first", () => {
    expect(issuesOf(deeplConfig({ fr: "FR", it: "IT" })).map((issue) => issue.path)).toEqual([
      "provider.options.localeMap.fr",
      "provider.options.localeMap.it",
    ]);
  });

  it("suggests the configured spelling for a key that differs only in case", () => {
    const [issue] = issuesOf(deeplConfig({ "zh-hant": "ZH-HANT" }));
    expect(issue?.message).toContain('did you mean "zh-Hant"?');
  });

  it("rejects a key that is not a locale code at all", () => {
    const [issue] = issuesOf(deeplConfig({ toString: "EN" }));
    expect(issue).toEqual({
      path: "provider.options.localeMap.toString",
      message: expect.stringContaining('"toString" is not a configured locale'),
    });
  });

  it.each([[{ "pt-BR": "" }], [{ "pt-BR": 3 }]])(
    "rejects an empty or non-string code: %j",
    (map) => {
      expect(issuesOf(deeplConfig(map)).map((issue) => issue.path)).toEqual([
        "provider.options.localeMap.pt-BR",
      ]);
    },
  );

  it("rejects a code longer than 64 characters", () => {
    expect(issuesOf(deeplConfig({ "pt-BR": "x".repeat(64) }))).toEqual([]);
    expect(issuesOf(deeplConfig({ "pt-BR": "x".repeat(65) })).map((issue) => issue.path)).toEqual([
      "provider.options.localeMap.pt-BR",
    ]);
  });

  it("is rejected on the none provider, which has no options", () => {
    const config = { ...baseConfig(), provider: { id: "none", options: { localeMap: {} } } };
    expect(verbatraConfigSchema.safeParse(config).success).toBe(false);
  });
});
