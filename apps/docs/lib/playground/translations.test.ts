import { describe, expect, it } from "vitest";
import { placeholdersOf, playgroundOutputSchema } from "./schema";
import committed from "./translations.json" with { type: "json" };

const SOURCE_ITEMS = [
  { id: "save", text: "Save changes" },
  { id: "signIn", text: "Sign in" },
  { id: "welcomeBack", text: "Welcome back, {name}!" },
  { id: "invited", text: "{name} invited you to {project}" },
  { id: "cartEmpty", text: "Your cart is empty." },
  { id: "deleteFile", text: "Delete this file?" },
  { id: "dontShow", text: "Don't show this again" },
  { id: "settings", text: "Settings" },
  { id: "onlyChanged", text: "Only changed keys get translated." },
  { id: "brand", text: "Verbatra", sameAllowed: true },
  { id: "checkoutTitle", text: "Review and checkout" },
  { id: "checkoutPay", text: "Pay and place order" },
];

const LANGUAGES = ["de", "es", "fr", "ja"];

const PLACEHOLDERS: ReadonlyArray<readonly [string, string]> = [
  ["welcomeBack", "{name}"],
  ["invited", "{name}"],
  ["invited", "{project}"],
];

const parsed = playgroundOutputSchema.parse(committed);

describe("committed playground translations", () => {
  it("parses through the playground output schema", () => {
    expect(playgroundOutputSchema.safeParse(committed).success).toBe(true);
  });

  it("holds exactly the source items in source order", () => {
    expect(parsed.items).toEqual(SOURCE_ITEMS);
  });

  it("holds exactly the planned languages", () => {
    expect(Object.keys(parsed.translations).sort()).toEqual(LANGUAGES);
  });

  it.each(LANGUAGES)("translates every source item into %s", (language) => {
    expect(Object.keys(parsed.translations[language] ?? {}).sort()).toEqual(
      SOURCE_ITEMS.map((item) => item.id).sort(),
    );
  });

  it.each(
    LANGUAGES.flatMap((language) =>
      PLACEHOLDERS.map(([id, placeholder]) => [language, id, placeholder] as const),
    ),
  )("keeps the placeholder exactly once in %s.%s", (language, id, placeholder) => {
    const value = parsed.translations[language]?.[id] ?? "";
    expect(value.split(placeholder)).toHaveLength(2);
    expect(placeholdersOf(value)).toContain(placeholder);
  });

  it("records the generation metadata", () => {
    expect(parsed.metadata).toMatchObject({ provider: "gemini", temperature: "provider default" });
  });
});
