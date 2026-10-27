import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { i18n } from "@/lib/i18n";

const MESSAGES_DIR = new URL("../../../../messages/", import.meta.url);

function privacyMessages(locale: string): unknown {
  const messages = JSON.parse(readFileSync(new URL(`${locale}.json`, MESSAGES_DIR), "utf8"));
  return messages.legal.privacy;
}

function leafKeyPaths(node: unknown, prefix = ""): string[] {
  if (typeof node !== "object" || node === null) {
    return [prefix];
  }
  return Object.entries(node).flatMap(([key, child]) =>
    leafKeyPaths(child, prefix === "" ? key : `${prefix}.${key}`),
  );
}

const sourceKeys = leafKeyPaths(privacyMessages(i18n.defaultLanguage)).sort();

describe("privacy policy messages: locale parity", () => {
  it("has a non-empty source block", () => {
    expect(sourceKeys.length).toBeGreaterThan(0);
  });

  it.each(i18n.languages)("%s has exactly the source's section keys", (locale) => {
    expect(leafKeyPaths(privacyMessages(locale)).sort()).toEqual(sourceKeys);
  });

  it.each(i18n.languages)("%s has no empty text", (locale) => {
    const messages = privacyMessages(locale);
    const empty = leafKeyPaths(messages).filter((path) => {
      const value = path
        .split(".")
        .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], messages);
      return typeof value !== "string" || value.trim() === "";
    });
    expect(empty).toEqual([]);
  });
});
