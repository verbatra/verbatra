import { describe, expect, it } from "vitest";
import { createMemoryAdapterFs } from "../test-support.js";
import { createGettextAdapter } from "./gettext-adapter.js";

const PATH = "/locales/pt_BR.po";

async function writeOver(existing: string | undefined, values: Record<string, string>) {
  const fs = createMemoryAdapterFs(existing === undefined ? {} : { [PATH]: existing });
  const adapter = createGettextAdapter(fs);
  const entries =
    existing === undefined
      ? new Map()
      : new Map((await adapter.read(PATH, "pt-BR")).resource.entries);
  for (const [key, value] of Object.entries(values)) {
    entries.set(key, { key, namespace: "pt_BR", value, placeholders: [], isPlural: false });
  }
  await adapter.write({ locale: "pt-BR", namespace: "pt_BR", format: "gettext-po", entries }, PATH);
  return fs.files.get(PATH) ?? "";
}

const EXISTING = [
  'msgid ""',
  'msgstr ""',
  '"Language: pt_BR\\n"',
  '"Content-Type: text/plain; charset=UTF-8\\n"',
  "",
  'msgid "Hello"',
  'msgstr "Olá"',
  "",
].join("\n");

describe("gettext writer: layout", () => {
  it("separates a new entry from the one before it with a blank line", async () => {
    expect(await writeOver(EXISTING, { Bye: "Tchau" })).toBe(
      `${EXISTING}\nmsgid "Bye"\nmsgstr "Tchau"\n`,
    );
  });

  it("adds the blank line when the file does not end with one", async () => {
    expect(await writeOver(EXISTING.trimEnd(), { Bye: "Tchau" })).toBe(
      `${EXISTING}\nmsgid "Bye"\nmsgstr "Tchau"\n`,
    );
  });

  it("creates a new catalogue with a Language header and blank lines between entries", async () => {
    expect(await writeOver(undefined, { Hello: "Olá", Bye: "Tchau" })).toBe(
      [
        'msgid ""',
        'msgstr ""',
        '"Language: pt_BR\\n"',
        '"Content-Type: text/plain; charset=UTF-8\\n"',
        '"Content-Transfer-Encoding: 8bit\\n"',
        "",
        'msgid "Hello"',
        'msgstr "Olá"',
        "",
        'msgid "Bye"',
        'msgstr "Tchau"',
        "",
      ].join("\n"),
    );
  });

  it("keeps an existing Language header as it is", async () => {
    expect(await writeOver(EXISTING, {})).toBe(EXISTING);
  });
});

describe("gettext writer: the Language header of a new catalogue", () => {
  async function languageHeader(locale: string): Promise<string | undefined> {
    const fs = createMemoryAdapterFs({});
    const adapter = createGettextAdapter(fs);
    const entries = new Map([
      [
        "Hello",
        { key: "Hello", namespace: "messages", value: "x", placeholders: [], isPlural: false },
      ],
    ]);
    await adapter.write({ locale, namespace: "messages", format: "gettext-po", entries }, PATH);
    return /"Language: ([^"\\]*)\\n"/.exec(fs.files.get(PATH) ?? "")?.[1];
  }

  it.each([
    ["sr-Latn", "sr@latin"],
    ["sr-Latn-RS", "sr_RS@latin"],
    ["uz-Cyrl", "uz@cyrillic"],
    ["zh-Hant-TW", "zh_TW"],
    ["es-419", "es_419"],
    ["pt-BR", "pt_BR"],
  ])("names %s as %s, the gettext locale name its directory uses", async (locale, expected) => {
    expect(await languageHeader(locale)).toBe(expected);
  });

  it("falls back to the underscore spelling for a locale with no gettext name", async () => {
    expect(await languageHeader("zh-Hant")).toBe("zh_Hant");
  });
});
