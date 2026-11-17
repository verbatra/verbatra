import { describe, expect, it } from "vitest";
import { baseConfig } from "../test-support.js";
import { verbatraConfigSchema } from "./schema.js";

function toneConfig(tone: unknown, targetLocales: string[] = ["de", "ja"]) {
  return { ...baseConfig({ targetLocales }), tone };
}

function issuesOf(input: unknown): ReadonlyArray<{ path: string; message: string }> {
  const result = verbatraConfigSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

describe("verbatraConfigSchema: tone", () => {
  it("accepts each scalar tone and an absent tone", () => {
    for (const tone of ["formal", "informal", "neutral"]) {
      expect(verbatraConfigSchema.safeParse(toneConfig(tone)).success).toBe(true);
    }
    expect(verbatraConfigSchema.safeParse(baseConfig()).success).toBe(true);
  });

  it("rejects an unknown scalar tone", () => {
    expect(issuesOf(toneConfig("casual")).map((issue) => issue.path)).toContain("tone");
  });

  it("accepts a map with a default and target locale keys", () => {
    const parsed = verbatraConfigSchema.parse(toneConfig({ default: "informal", ja: "neutral" }));
    expect(parsed.tone).toEqual({ default: "informal", ja: "neutral" });
  });

  it("accepts a map with only a default and a map with only locale keys", () => {
    expect(verbatraConfigSchema.safeParse(toneConfig({ default: "formal" })).success).toBe(true);
    expect(verbatraConfigSchema.safeParse(toneConfig({ ja: "formal" })).success).toBe(true);
  });

  it("rejects an empty map", () => {
    expect(issuesOf(toneConfig({}))).toEqual([
      { path: "tone", message: expect.stringContaining("at least one") },
    ]);
  });

  it("rejects a key that is not a target locale, naming the key as the path", () => {
    const issues = issuesOf(toneConfig({ default: "informal", fr: "formal" }));
    expect(issues).toEqual([{ path: "tone.fr", message: expect.stringContaining('"fr"') }]);
  });

  it("rejects the source locale as a key, because only targets are translated", () => {
    expect(issuesOf(toneConfig({ en: "formal" })).map((issue) => issue.path)).toEqual(["tone.en"]);
  });

  it("suggests the configured spelling when a key differs only in case", () => {
    const [issue] = issuesOf(toneConfig({ JA: "formal" }, ["ja"]));
    expect(issue?.path).toBe("tone.JA");
    expect(issue?.message).toContain('did you mean "ja"');
  });

  it("rejects two keys that differ only in case", () => {
    const issues = issuesOf(toneConfig({ ja: "formal", JA: "neutral" }, ["ja"]));
    expect(issues.some((issue) => issue.message.includes("differs only in case"))).toBe(true);
  });

  it("rejects an unknown tone value inside a map, naming the accepted shapes and the key", () => {
    const issues = issuesOf(toneConfig({ ja: "casual" }));
    expect(issues).toEqual([
      { path: "tone", message: expect.stringContaining("formal, informal or neutral") },
    ]);
    expect(issues[0]?.message).toContain('tone.ja is "casual"');
  });

  it("names every offending key of a map, not only the first", () => {
    const [issue] = issuesOf(toneConfig({ ja: "casual", de: "polite" }));
    expect(issue?.message).toContain('tone.ja is "casual"');
    expect(issue?.message).toContain('tone.de is "polite"');
  });

  it("suggests the reserved default when a key differs from it only in case", () => {
    const [issue] = issuesOf(toneConfig({ Default: "formal" }));
    expect(issue?.path).toBe("tone.Default");
    expect(issue?.message).toContain('did you mean "default"');
  });

  it("rejects a non-string, non-object tone", () => {
    expect(issuesOf(toneConfig(3)).map((issue) => issue.path)).toContain("tone");
    expect(issuesOf(toneConfig(["formal"])).map((issue) => issue.path)).toContain("tone");
  });
});
