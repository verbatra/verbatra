import { describe, expect, it } from "vitest";
import type { TranslationEntry } from "../model/translation-entry.js";
import { entry, resource } from "../testing/factories.js";
import { findInconsistentTranslations } from "./inconsistent-translations.js";

class CountingMap<K, V> extends Map<K, V> {
  reads = 0;

  override get(key: K): V | undefined {
    this.reads += 1;
    return super.get(key);
  }

  override has(key: K): boolean {
    this.reads += 1;
    return super.has(key);
  }
}

type Row = readonly [key: string, source: string, translation: string];

function catalog(rows: readonly Row[], sourceOverrides: Partial<TranslationEntry> = {}) {
  const source = resource(
    "en",
    rows.map(([key, value]) => entry({ ...sourceOverrides, key, value })),
  );
  const target = resource(
    "de",
    rows.map(([key, , value]) => entry({ key, value })),
  );
  return { source, target, keys: rows.map(([key]) => key) };
}

function suffixPluralForm(key: string): string | undefined {
  return /_(zero|one|two|few|many|other)$/.exec(key)?.[1];
}

function findIn(rows: readonly Row[]) {
  const { source, target, keys } = catalog(rows);
  return findInconsistentTranslations(source, target, keys);
}

describe("findInconsistentTranslations", () => {
  it("reports two keys sharing a source but holding different translations as one group", () => {
    expect(
      findIn([
        ["actions.save", "Save", "Speichern"],
        ["toolbar.save", "Save", "Sichern"],
      ]),
    ).toEqual([
      {
        source: "Save",
        isPlural: false,
        translations: [
          { value: "Sichern", keys: ["toolbar.save"] },
          { value: "Speichern", keys: ["actions.save"] },
        ],
      },
    ]);
  });

  it("names every distinct translation with all of its keys", () => {
    const [group] = findIn([
      ["c", "Save", "Speichern"],
      ["a", "Save", "Sichern"],
      ["b", "Save", "Speichern"],
      ["d", "Save", "Ablegen"],
    ]);
    expect(group?.translations).toEqual([
      { value: "Ablegen", keys: ["d"] },
      { value: "Sichern", keys: ["a"] },
      { value: "Speichern", keys: ["b", "c"] },
    ]);
  });

  it("reports nothing when identical sources carry identical translations", () => {
    expect(
      findIn([
        ["a", "Save", "Speichern"],
        ["b", "Save", "Speichern"],
      ]),
    ).toEqual([]);
  });

  it("reports nothing for a source value that appears under only one key", () => {
    expect(
      findIn([
        ["a", "Save", "Speichern"],
        ["b", "Cancel", "Abbrechen"],
      ]),
    ).toEqual([]);
  });

  it("treats translations differing only in leading or trailing whitespace as the same", () => {
    expect(
      findIn([
        ["a", "Save", "Speichern"],
        ["b", "Save", "  Speichern \n"],
        ["c", "Save", "\tSpeichern"],
      ]),
    ).toEqual([]);
  });

  it("groups sources that differ only in leading or trailing whitespace", () => {
    const [group] = findIn([
      ["a", " Save", "Speichern"],
      ["b", "Save\n", "Sichern"],
    ]);
    expect(group?.source).toBe("Save");
  });

  it("keeps internal whitespace significant", () => {
    const [group] = findIn([
      ["a", "Save", "Jetzt speichern"],
      ["b", "Save", "Jetzt  speichern"],
    ]);
    expect(group?.translations.map((translation) => translation.value)).toEqual([
      "Jetzt  speichern",
      "Jetzt speichern",
    ]);
  });

  it("keeps letter case significant on both sides", () => {
    expect(
      findIn([
        ["a", "Save", "Speichern"],
        ["b", "save", "Sichern"],
      ]),
    ).toEqual([]);
    expect(
      findIn([
        ["a", "Save", "Speichern"],
        ["b", "Save", "speichern"],
      ]),
    ).toHaveLength(1);
  });

  it("compares in Unicode NFC and with folded line endings", () => {
    expect(
      findIn([
        ["a", "Cafe\u0301", "Caf\u00e9 a\r\nb"],
        ["b", "Caf\u00e9", "Cafe\u0301 a\nb"],
      ]),
    ).toEqual([]);
  });

  it("compares placeholders as part of the literal value", () => {
    expect(
      findIn([
        ["a", "Hello {name}", "Hallo {name}"],
        ["b", "Hello {user}", "Servus {user}"],
      ]),
    ).toEqual([]);
    expect(
      findIn([
        ["a", "Hello {name}", "Hallo {name}"],
        ["b", "Hello {name}", "Servus {name}"],
      ]),
    ).toHaveLength(1);
  });

  it("skips a key whose source or translation is empty once trimmed", () => {
    expect(
      findIn([
        ["a", "Save", "Speichern"],
        ["b", "Save", "   "],
        ["c", " ", "Sichern"],
        ["d", "", "Ablegen"],
      ]),
    ).toEqual([]);
  });

  it("skips a key absent from the source or the target", () => {
    const { source, target } = catalog([
      ["a", "Save", "Speichern"],
      ["b", "Save", "Sichern"],
    ]);
    const partialTarget = resource("de", [entry({ key: "a", value: "Speichern" })]);
    expect(findInconsistentTranslations(source, partialTarget, ["a", "b"])).toEqual([]);
    expect(findInconsistentTranslations(source, target, ["a", "b", "ghost"])).toHaveLength(1);
  });

  it("considers only the keys it is given", () => {
    const { source, target } = catalog([
      ["a", "Save", "Speichern"],
      ["b", "Save", "Sichern"],
    ]);
    expect(findInconsistentTranslations(source, target, ["a"])).toEqual([]);
  });

  it("does not report a translation that merely equals its own source", () => {
    expect(
      findIn([
        ["a", "OK", "OK"],
        ["b", "OK", "OK"],
      ]),
    ).toEqual([]);
  });

  it("never groups keys whose description, meaning, or plural flag differ", () => {
    const source = resource("en", [
      entry({ key: "a", value: "Open", description: "a door" }),
      entry({ key: "b", value: "Open", description: "a file" }),
      entry({ key: "c", value: "Open", meaning: "state" }),
      entry({ key: "d", value: "Open", isPlural: true }),
      entry({ key: "e", value: "Open" }),
    ]);
    const target = resource("de", [
      entry({ key: "a", value: "Aufmachen" }),
      entry({ key: "b", value: "Öffnen" }),
      entry({ key: "c", value: "Offen" }),
      entry({ key: "d", value: "Geöffnet" }),
      entry({ key: "e", value: "Auf" }),
    ]);
    expect(findInconsistentTranslations(source, target, ["a", "b", "c", "d", "e"])).toEqual([]);
  });

  it("groups keys whose shared description matches and reports that description", () => {
    const { source, target, keys } = catalog(
      [
        ["a", "Open", "Öffnen"],
        ["b", "Open", "Aufmachen"],
      ],
      { description: "a file", meaning: "verb", isPlural: true },
    );
    expect(findInconsistentTranslations(source, target, keys)).toEqual([
      {
        source: "Open",
        description: "a file",
        meaning: "verb",
        isPlural: true,
        translations: [
          { value: "Aufmachen", keys: ["b"] },
          { value: "Öffnen", keys: ["a"] },
        ],
      },
    ]);
  });

  it("never groups keys whose format-encoded context differs", () => {
    const { source, target, keys } = catalog([
      ["door|Open", "Open", "Aufmachen"],
      ["file|Open", "Open", "Öffnen"],
      ["Open", "Open", "Auf"],
    ]);
    const contextOf = (key: string): string | undefined =>
      key.includes("|") ? key.slice(0, key.indexOf("|")) : undefined;
    expect(findInconsistentTranslations(source, target, keys, { contextOf })).toEqual([]);
    expect(findInconsistentTranslations(source, target, keys)).toHaveLength(1);
  });

  it("reports the shared context of a group whose keys agree on it", () => {
    const { source, target, keys } = catalog([
      ["menu|a", "Open", "Aufmachen"],
      ["menu|b", "Open", "Öffnen"],
    ]);
    const [group] = findInconsistentTranslations(source, target, keys, {
      contextOf: (key) => key.slice(0, key.indexOf("|")),
    });
    expect(group?.context).toBe("menu");
  });

  it("returns the same sorted report regardless of key order", () => {
    const rows: Row[] = [
      ["z.save", "Save", "Speichern"],
      ["a.cancel", "Cancel", "Abbrechen"],
      ["m.save", "Save", "Sichern"],
      ["b.cancel", "Cancel", "Stornieren"],
      ["c.save", "Save", "Speichern"],
    ];
    const forward = findIn(rows);
    const reversed = findIn([...rows].reverse());
    expect(reversed).toEqual(forward);
    expect(forward.map((group) => group.source)).toEqual(["Cancel", "Save"]);
    expect(forward[1]?.translations[1]?.keys).toEqual(["c.save", "z.save"]);
  });

  it("orders groups sharing a source by context, description, meaning, then plural flag", () => {
    const source = resource("en", [
      entry({ key: "p1", value: "Open", isPlural: true }),
      entry({ key: "p2", value: "Open", isPlural: true }),
      entry({ key: "m1", value: "Open", meaning: "m" }),
      entry({ key: "m2", value: "Open", meaning: "m" }),
      entry({ key: "d1", value: "Open", description: "d" }),
      entry({ key: "d2", value: "Open", description: "d" }),
      entry({ key: "x1", value: "Open", description: "d", meaning: "m" }),
      entry({ key: "x2", value: "Open", description: "d", meaning: "m" }),
      entry({ key: "k1", value: "Open", description: "e" }),
      entry({ key: "k2", value: "Open", description: "e" }),
      entry({ key: "n1", value: "Open" }),
      entry({ key: "n2", value: "Open" }),
    ]);
    const target = resource(
      "de",
      [...source.entries.keys()].map((key) => entry({ key, value: `Offen ${key.at(-1)}` })),
    );
    const groups = findInconsistentTranslations(source, target, [...source.entries.keys()]);
    expect(groups.map((group) => [group.description, group.meaning, group.isPlural])).toEqual([
      [undefined, undefined, false],
      [undefined, undefined, true],
      [undefined, "m", false],
      ["d", undefined, false],
      ["d", "m", false],
      ["e", undefined, false],
    ]);
  });

  it("never groups the different plural forms of one key with each other", () => {
    const source = resource("en", [
      entry({ key: "selected_one", value: "{{count}} selected", isPlural: true }),
      entry({ key: "selected_other", value: "{{count}} selected", isPlural: true }),
    ]);
    const target = resource("ru", [
      entry({ key: "selected_one", value: "Выбран {{count}}", isPlural: true }),
      entry({ key: "selected_other", value: "Выбрано {{count}}", isPlural: true }),
    ]);
    expect(
      findInconsistentTranslations(source, target, [...source.entries.keys()], {
        pluralFormOf: suffixPluralForm,
      }),
    ).toEqual([]);
  });

  it("groups the same plural form across different keys and reports that form", () => {
    const source = resource("en", [
      entry({ key: "a_one", value: "{{count}} file", isPlural: true }),
      entry({ key: "a_other", value: "{{count}} files", isPlural: true }),
      entry({ key: "b_one", value: "{{count}} file", isPlural: true }),
      entry({ key: "b_other", value: "{{count}} files", isPlural: true }),
    ]);
    const target = resource("ru", [
      entry({ key: "a_one", value: "{{count}} файл", isPlural: true }),
      entry({ key: "a_other", value: "{{count}} файлов", isPlural: true }),
      entry({ key: "b_one", value: "{{count}} документ", isPlural: true }),
      entry({ key: "b_other", value: "{{count}} файлов", isPlural: true }),
    ]);
    expect(
      findInconsistentTranslations(source, target, [...source.entries.keys()], {
        pluralFormOf: suffixPluralForm,
      }),
    ).toEqual([
      {
        source: "{{count}} file",
        isPlural: true,
        pluralForm: "one",
        translations: [
          { value: "{{count}} документ", keys: ["b_one"] },
          { value: "{{count}} файл", keys: ["a_one"] },
        ],
      },
    ]);
  });

  it("orders groups sharing a source and plural flag by plural form", () => {
    const rows = ["x_other", "y_other", "x_one", "y_one"];
    const source = resource(
      "en",
      rows.map((key) => entry({ key, value: "{{count}} selected", isPlural: true })),
    );
    const target = resource(
      "de",
      rows.map((key) => entry({ key, value: `${key} ausgewählt`, isPlural: true })),
    );
    const groups = findInconsistentTranslations(source, target, rows, {
      pluralFormOf: suffixPluralForm,
    });
    expect(groups.map((group) => group.pluralForm)).toEqual(["one", "other"]);
  });

  it("asks for a plural form only for plural entries", () => {
    const { source, target, keys } = catalog([
      ["size_few", "Small", "Klein"],
      ["size_many", "Small", "Winzig"],
    ]);
    const asked: string[] = [];
    const groups = findInconsistentTranslations(source, target, keys, {
      pluralFormOf: (key) => {
        asked.push(key);
        return suffixPluralForm(key);
      },
    });
    expect(asked).toEqual([]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).not.toHaveProperty("pluralForm");
  });

  it("reads each entry, context, and plural form once", () => {
    const measure = (size: number) => {
      const sourceEntries = new CountingMap<string, TranslationEntry>();
      const targetEntries = new CountingMap<string, TranslationEntry>();
      const pluralKeys: string[] = [];
      for (let index = 0; index < size; index += 1) {
        const key = `key.${index}`;
        const pluralKey = `items.${index}_other`;
        pluralKeys.push(pluralKey);
        sourceEntries.set(key, entry({ key, value: "Save" }));
        targetEntries.set(key, entry({ key, value: index % 2 === 0 ? "Speichern" : "Sichern" }));
        sourceEntries.set(pluralKey, entry({ key: pluralKey, value: "Items", isPlural: true }));
        targetEntries.set(
          pluralKey,
          entry({ key: pluralKey, value: index % 2 === 0 ? "Elemente" : "Einträge" }),
        );
      }
      let contextCalls = 0;
      const pluralFormAsked: string[] = [];
      const groups = findInconsistentTranslations(
        { ...resource("en", []), entries: sourceEntries },
        { ...resource("de", []), entries: targetEntries },
        [...sourceEntries.keys()],
        {
          contextOf: () => {
            contextCalls += 1;
            return undefined;
          },
          pluralFormOf: (key) => {
            pluralFormAsked.push(key);
            return suffixPluralForm(key);
          },
        },
      );
      expect(
        groups.map((group) => ({
          source: group.source,
          pluralForm: group.pluralForm,
          sizes: group.translations.map((translation) => translation.keys.length),
        })),
      ).toEqual([
        { source: "Items", pluralForm: "other", sizes: [size / 2, size / 2] },
        { source: "Save", pluralForm: undefined, sizes: [size / 2, size / 2] },
      ]);
      expect(pluralFormAsked).toEqual(pluralKeys);
      return {
        reads: sourceEntries.reads + targetEntries.reads,
        contextCalls,
        pluralFormCalls: pluralFormAsked.length,
      };
    };
    expect(measure(1_000)).toEqual({ reads: 4_000, contextCalls: 2_000, pluralFormCalls: 1_000 });
    expect(measure(4_000)).toEqual({ reads: 16_000, contextCalls: 8_000, pluralFormCalls: 4_000 });
  });
});
