import { describe, expect, it } from "vitest";
import { MESSAGE_CATALOGS } from "@/lib/message-catalogs";

function strings(value: unknown, path: string[] = []): Array<[string, string]> {
  if (typeof value === "string") return [[path.join("."), value]];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => strings(child, [...path, key]));
}

function prose(text: string): string {
  return text.replace(/<code>[^<]*<\/code>/g, "").replace(/`[^`]*`/g, "");
}

describe("the landing vocabulary", () => {
  it("uses the German word of the lock demo for the provider everywhere, never the English noun", () => {
    const offenders = strings(MESSAGE_CATALOGS.de.landing, ["landing"])
      .filter(([, text]) => /\bProvider/.test(prose(text)))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it("names the provider's answer in the French gate caption, not an answer that was provided", () => {
    expect(MESSAGE_CATALOGS.fr.landing.gate.candidate.answer).toMatch(/fournisseur/);
    expect(MESSAGE_CATALOGS.fr.landing.gate.candidate.answer).not.toMatch(/fournie/);
  });

  it("labels the file value the gate left alone with a key that says so, once, in every locale", () => {
    for (const catalog of Object.values(MESSAGE_CATALOGS)) {
      expect(catalog.landing.gate.valueUnchanged).toBeTruthy();
      expect(catalog.landing.gate.refused).not.toHaveProperty("unchanged");
    }
  });
});
