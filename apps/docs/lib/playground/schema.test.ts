import { describe, expect, it } from "vitest";
import {
  itemProblems,
  placeholdersOf,
  playgroundOutputSchema,
  translationProblems,
} from "./schema";
import committed from "./translations.json" with { type: "json" };

function output(value: string, source = "Welcome back, {name}!", sameAllowed = false) {
  return {
    items: [{ id: "welcome", text: source, ...(sameAllowed ? { sameAllowed } : {}) }],
    translations: { fr: { welcome: value } },
    metadata: {
      sdkVersion: "0.12.0",
      provider: "gemini",
      model: "gemini-2.5-flash",
      generatedAt: "2026-10-16T12:00:00.000Z",
      temperature: "provider default",
    },
  };
}

describe("translationProblems", () => {
  it.each([
    ["NBSP and narrow NBSP in French", "Bon retour, {name}\u202f!\u00a0Oui"],
    ["guillemets", "« Bon retour », {name}"],
    ["inverted marks", "¡Bienvenido de nuevo, {name}! ¿Listo?"],
    ["Japanese", "おかえりなさい、{name}さん！"],
    ["an apostrophe", "N'oublie pas, {name}"],
    ["a sentence ending in a period", "Bon retour, {name}. Ton panier est vide."],
  ])("accepts NBSP U+202F, guillemets, inverted marks, Japanese: %s", (_label, value) => {
    expect(translationProblems("Welcome back, {name}!", value, false)).toEqual([]);
  });

  it.each([
    ["empty", "   "],
    ["multi-line", "Bon retour,\n{name}"],
    ["line separator", "Bon retour,\u2028{name}"],
    ["over 80 characters", `${"a".repeat(78)} {name}`],
    ["a control character", "Bon retour\u0007 {name}"],
    ["HTML", "<b>Bon retour</b>, {name}"],
    ["an HTML entity", "Bon retour&nbsp;{name}"],
    ["markdown emphasis", "**Bon retour**, {name}"],
    ["a markdown link", "[Bon retour](x), {name}"],
    ["a markdown heading", "# Bon retour, {name}"],
    ["a code fence", "```Bon retour``` {name}"],
    ["a URL", "Bon retour https://example.org {name}"],
    ["a bare host path", "Bon retour example.org/x {name}"],
    ["a bare domain", "Bon retour evil.com {name}"],
    ["a www host", "Bon retour www.x.de {name}"],
    ["a bare country domain", "Bon retour x.de {name}"],
    ["a right-to-left override", "Bon retour \u202e{name}"],
    ["a zero-width space", "Bon\u200bretour {name}"],
    ["a zero-width joiner", "Bon retour\u200d {name}"],
    ["a byte order mark", "\ufeffBon retour {name}"],
    ["a missing placeholder", "Bon retour !"],
    ["a duplicated placeholder", "Bon retour, {name} {name}"],
    ["a renamed placeholder", "Bon retour, {nom}"],
    ["an extra placeholder", "Bon retour, {name} {count}"],
    ["a stray brace", "Bon retour, {name} }"],
    ["the source itself", "Welcome back, {name}!"],
  ])("rejects each invalid output: %s", (_label, value) => {
    expect(translationProblems("Welcome back, {name}!", value, false).length).toBeGreaterThan(0);
  });

  it("allows a value identical to its source only when the item says so", () => {
    expect(translationProblems("Verbatra", "Verbatra", true)).toEqual([]);
    expect(translationProblems("Verbatra", "Verbatra", false)).toEqual([
      "is identical to the source",
    ]);
  });
});

describe("playgroundOutputSchema", () => {
  it("accepts a valid output", () => {
    expect(playgroundOutputSchema.safeParse(output("Bon retour, {name} !")).success).toBe(true);
  });

  it("rejects an invalid translation, a missing pair and an unknown key", () => {
    expect(playgroundOutputSchema.safeParse(output("Bon retour !")).success).toBe(false);
    const missing = { ...output("x {name}"), translations: { fr: {} } };
    expect(playgroundOutputSchema.safeParse(missing).success).toBe(false);
    const unknown = {
      ...output("x {name}"),
      translations: { fr: { welcome: "x {name}", other: "y" } },
    };
    expect(playgroundOutputSchema.safeParse(unknown).success).toBe(false);
  });

  it("rejects extra fields at every level", () => {
    const valid = output("Bon retour, {name} !");
    expect(playgroundOutputSchema.safeParse({ ...valid, raw: {} }).success).toBe(false);
    expect(
      playgroundOutputSchema.safeParse({
        ...valid,
        metadata: { ...valid.metadata, requestId: "r" },
      }).success,
    ).toBe(false);
  });

  it.each([
    ["an HTML tag", "Save <b>changes</b>", "contains HTML"],
    ["a named entity", "Save &amp; close", "contains HTML"],
    ["a numeric entity", "Save &#60;now", "contains HTML"],
    ["a line break", "Save\nchanges", "is not a single line"],
    ["a bidi control", "Save\u202echanges", "contains a bidi or zero-width format character"],
    ["markdown", "Save **changes**", "contains markdown or a code fence"],
    ["a URL", "Visit https://example.com", "contains a URL"],
  ])("rejects a source item with %s, as it rejects a translation", (_, text, problem) => {
    expect(itemProblems(text)).toContain(problem);
    expect(translationProblems("Save changes", text, false)).toContain(problem);
    const result = playgroundOutputSchema.safeParse(output("Enregistrer", text));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      `items.welcome ${problem}`,
    );
  });

  it("accepts every committed source item", () => {
    for (const item of committed.items) expect(itemProblems(item.text)).toEqual([]);
    expect(playgroundOutputSchema.safeParse(committed).success).toBe(true);
  });

  it("records the temperature as the provider default", () => {
    const valid = output("Bon retour, {name} !");
    const wrong = { ...valid, metadata: { ...valid.metadata, temperature: "0" } };
    expect(playgroundOutputSchema.safeParse(wrong).success).toBe(false);
  });
});

describe("placeholdersOf", () => {
  it("lists single-brace placeholders", () => {
    expect(placeholdersOf("You have {count} new messages, {name}")).toEqual(["{count}", "{name}"]);
  });
});
