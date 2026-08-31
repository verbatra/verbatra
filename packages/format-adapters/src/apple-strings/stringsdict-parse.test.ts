import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { AdapterError } from "../errors.js";
import { nodeAdapterFs } from "../fs-port.js";
import { MAX_INPUT_BYTES } from "../json/limits.js";
import {
  parseAppleStringsDictEntries,
  parseStringsDictGroups,
  serializeAppleStringsDictEntries,
} from "./stringsdict-parse.js";

const PLIST_HEADER =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n';

function stringsdict(body: string): string {
  return `${PLIST_HEADER}<plist version="1.0"><dict>${body}</dict></plist>`;
}

const PHOTO_COUNT = stringsdict(
  "<key>photo_count</key><dict>" +
    "<key>NSStringLocalizedFormatKey</key><string>%#@photos@</string>" +
    "<key>photos</key><dict>" +
    "<key>NSStringFormatSpecTypeKey</key><string>NSStringPluralRuleType</string>" +
    "<key>NSStringFormatValueTypeKey</key><string>d</string>" +
    "<key>one</key><string>%d photo</string>" +
    "<key>other</key><string>%d photos</string>" +
    "</dict></dict>",
);

async function tempFile(name: string, content: string): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), "verbatra-stringsdict-")), name);
  await writeFile(path, content, "utf8");
  return path;
}

function pluralEntry(key: string, value: string): TranslationEntry {
  return { key, namespace: "Localizable", value, placeholders: [], isPlural: true };
}

describe("parseStringsDictGroups", () => {
  it("parses format key, variable name, value type, and categories in CLDR order", () => {
    const groups = parseStringsDictGroups(PHOTO_COUNT, "m.stringsdict");
    const group = groups.get("photo_count");
    expect(group?.formatKey).toBe("%#@photos@");
    expect(group?.variableName).toBe("photos");
    expect(group?.valueType).toBe("d");
    expect([...(group?.categories.keys() ?? [])]).toEqual(["one", "other"]);
    expect(group?.categories.get("one")).toBe("%d photo");
    expect(group?.categories.get("other")).toBe("%d photos");
  });

  it("parses several plural entries in document order", () => {
    const content = stringsdict(
      "<key>b_count</key><dict><key>NSStringLocalizedFormatKey</key><string>%#@v@</string>" +
        "<key>v</key><dict><key>NSStringFormatSpecTypeKey</key><string>NSStringPluralRuleType</string>" +
        "<key>other</key><string>%d</string></dict></dict>" +
        "<key>a_count</key><dict><key>NSStringLocalizedFormatKey</key><string>%#@v@</string>" +
        "<key>v</key><dict><key>NSStringFormatSpecTypeKey</key><string>NSStringPluralRuleType</string>" +
        "<key>other</key><string>%d</string></dict></dict>",
    );
    const groups = parseStringsDictGroups(content, "m.stringsdict");
    expect([...groups.keys()]).toEqual(["b_count", "a_count"]);
  });

  it("accepts a rule dict missing NSStringFormatValueTypeKey, leaving valueType undefined", () => {
    const content = stringsdict(
      "<key>k</key><dict><key>NSStringLocalizedFormatKey</key><string>%#@v@</string>" +
        "<key>v</key><dict><key>NSStringFormatSpecTypeKey</key><string>NSStringPluralRuleType</string>" +
        "<key>other</key><string>%d</string></dict></dict>",
    );
    const groups = parseStringsDictGroups(content, "m.stringsdict");
    expect(groups.get("k")?.valueType).toBeUndefined();
  });

  it("handles a locale with only one and other, omitting zero/two/few/many", () => {
    const groups = parseStringsDictGroups(PHOTO_COUNT, "m.stringsdict");
    const categories = groups.get("photo_count")?.categories;
    expect(categories?.has("zero")).toBe(false);
    expect(categories?.has("two")).toBe(false);
    expect(categories?.has("few")).toBe(false);
    expect(categories?.has("many")).toBe(false);
  });

  it("handles a richer locale with all six CLDR categories", () => {
    const content = stringsdict(
      "<key>k</key><dict><key>NSStringLocalizedFormatKey</key><string>%#@v@</string>" +
        "<key>v</key><dict><key>NSStringFormatSpecTypeKey</key><string>NSStringPluralRuleType</string>" +
        "<key>zero</key><string>zero %d</string><key>one</key><string>one %d</string>" +
        "<key>two</key><string>two %d</string><key>few</key><string>few %d</string>" +
        "<key>many</key><string>many %d</string><key>other</key><string>other %d</string>" +
        "</dict></dict>",
    );
    const groups = parseStringsDictGroups(content, "m.stringsdict");
    expect([...(groups.get("k")?.categories.keys() ?? [])]).toEqual([
      "zero",
      "one",
      "two",
      "few",
      "many",
      "other",
    ]);
  });

  it("allows the standard Apple plist DOCTYPE unmodified", () => {
    expect(() => parseStringsDictGroups(PHOTO_COUNT, "m.stringsdict")).not.toThrow();
  });

  it("rejects an internal DTD subset as INVALID_XML before parsing", () => {
    const malicious =
      '<?xml version="1.0"?>' +
      '<!DOCTYPE plist [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>' +
      "<plist><dict></dict></plist>";
    expect(() => parseStringsDictGroups(malicious, "m.stringsdict")).toThrow(AdapterError);
    try {
      parseStringsDictGroups(malicious, "m.stringsdict");
    } catch (error) {
      expect((error as AdapterError).code).toBe("INVALID_XML");
    }
  });

  it("rejects a bare <!ENTITY declaration outside any DOCTYPE as INVALID_XML", () => {
    const malicious = '<!ENTITY xxe SYSTEM "file:///etc/passwd"><plist><dict></dict></plist>';
    const error = (() => {
      try {
        parseStringsDictGroups(malicious, "m.stringsdict");
        return undefined;
      } catch (caught) {
        return caught as AdapterError;
      }
    })();
    expect(error?.code).toBe("INVALID_XML");
  });

  it("rejects malformed XML as INVALID_XML", () => {
    const error = (() => {
      try {
        parseStringsDictGroups("<plist><dict>", "m.stringsdict");
        return undefined;
      } catch (caught) {
        return caught as AdapterError;
      }
    })();
    expect(error).toBeInstanceOf(AdapterError);
    expect(error?.code).toBe("INVALID_XML");
  });

  it("rejects a document whose root is not <plist> as INVALID_STRUCTURE", () => {
    const error = (() => {
      try {
        parseStringsDictGroups("<notplist><dict></dict></notplist>", "m.stringsdict");
        return undefined;
      } catch (caught) {
        return caught as AdapterError;
      }
    })();
    expect(error?.code).toBe("INVALID_STRUCTURE");
  });

  it("rejects a plist with no top-level <dict> as INVALID_STRUCTURE naming the file", () => {
    const error = (() => {
      try {
        parseStringsDictGroups("<plist></plist>", "m.stringsdict");
        return undefined;
      } catch (caught) {
        return caught as AdapterError;
      }
    })();
    expect(error?.code).toBe("INVALID_STRUCTURE");
    expect(error?.message).toContain("m.stringsdict");
  });

  it("rejects a missing NSStringLocalizedFormatKey naming the file and the key", () => {
    const content = stringsdict("<key>k</key><dict></dict>");
    const error = (() => {
      try {
        parseStringsDictGroups(content, "m.stringsdict");
        return undefined;
      } catch (caught) {
        return caught as AdapterError;
      }
    })();
    expect(error?.code).toBe("INVALID_STRUCTURE");
    expect(error?.message).toContain("m.stringsdict");
    expect(error?.message).toContain('"k"');
    expect(error?.message).toContain("NSStringLocalizedFormatKey");
  });

  it("rejects a missing plural rule (no %#@variable@ substitution) with a specific message", () => {
    const content = stringsdict(
      "<key>k</key><dict><key>NSStringLocalizedFormatKey</key><string>plain text</string></dict>",
    );
    const error = (() => {
      try {
        parseStringsDictGroups(content, "m.stringsdict");
        return undefined;
      } catch (caught) {
        return caught as AdapterError;
      }
    })();
    expect(error?.code).toBe("INVALID_STRUCTURE");
    expect(error?.message).toContain("missing a plural rule");
  });

  it("rejects a format key referencing a variable with no matching rule dictionary", () => {
    const content = stringsdict(
      "<key>k</key><dict><key>NSStringLocalizedFormatKey</key><string>%#@missing@</string></dict>",
    );
    const error = (() => {
      try {
        parseStringsDictGroups(content, "m.stringsdict");
        return undefined;
      } catch (caught) {
        return caught as AdapterError;
      }
    })();
    expect(error?.code).toBe("INVALID_STRUCTURE");
    expect(error?.message).toContain('"missing"');
  });

  it("rejects an unsupported NSStringFormatSpecTypeKey naming the file and key", () => {
    const content = stringsdict(
      "<key>k</key><dict><key>NSStringLocalizedFormatKey</key><string>%#@v@</string>" +
        "<key>v</key><dict><key>NSStringFormatSpecTypeKey</key>" +
        "<string>NSStringVariableWidthRuleType</string></dict></dict>",
    );
    const error = (() => {
      try {
        parseStringsDictGroups(content, "m.stringsdict");
        return undefined;
      } catch (caught) {
        return caught as AdapterError;
      }
    })();
    expect(error?.code).toBe("INVALID_STRUCTURE");
    expect(error?.message).toContain("m.stringsdict");
    expect(error?.message).toContain('"k"');
    expect(error?.message).toContain("NSStringFormatSpecTypeKey");
  });

  it("rejects an unsupported plural category naming the file, key, and category", () => {
    const content = stringsdict(
      "<key>k</key><dict><key>NSStringLocalizedFormatKey</key><string>%#@v@</string>" +
        "<key>v</key><dict><key>NSStringFormatSpecTypeKey</key><string>NSStringPluralRuleType</string>" +
        "<key>onez</key><string>bad</string></dict></dict>",
    );
    const error = (() => {
      try {
        parseStringsDictGroups(content, "m.stringsdict");
        return undefined;
      } catch (caught) {
        return caught as AdapterError;
      }
    })();
    expect(error?.code).toBe("INVALID_STRUCTURE");
    expect(error?.message).toContain("m.stringsdict");
    expect(error?.message).toContain('"k"');
    expect(error?.message).toContain('"onez"');
  });

  it("rejects a rule dict with no plural categories at all", () => {
    const content = stringsdict(
      "<key>k</key><dict><key>NSStringLocalizedFormatKey</key><string>%#@v@</string>" +
        "<key>v</key><dict><key>NSStringFormatSpecTypeKey</key><string>NSStringPluralRuleType</string>" +
        "</dict></dict>",
    );
    const error = (() => {
      try {
        parseStringsDictGroups(content, "m.stringsdict");
        return undefined;
      } catch (caught) {
        return caught as AdapterError;
      }
    })();
    expect(error?.code).toBe("INVALID_STRUCTURE");
    expect(error?.message).toContain("no plural categories");
  });

  it("rejects two top-level entries sharing the same key", () => {
    const content = stringsdict(
      "<key>k</key><dict><key>NSStringLocalizedFormatKey</key><string>%#@v@</string>" +
        "<key>v</key><dict><key>NSStringFormatSpecTypeKey</key><string>NSStringPluralRuleType</string>" +
        "<key>other</key><string>%d</string></dict></dict>" +
        "<key>k</key><dict><key>NSStringLocalizedFormatKey</key><string>%#@v@</string>" +
        "<key>v</key><dict><key>NSStringFormatSpecTypeKey</key><string>NSStringPluralRuleType</string>" +
        "<key>other</key><string>%d</string></dict></dict>",
    );
    const error = (() => {
      try {
        parseStringsDictGroups(content, "m.stringsdict");
        return undefined;
      } catch (caught) {
        return caught as AdapterError;
      }
    })();
    expect(error?.code).toBe("INVALID_STRUCTURE");
    expect(error?.message).toContain("two entries");
  });

  it("rejects an entry value that is not a <dict>", () => {
    const content = stringsdict("<key>k</key><string>oops</string>");
    const error = (() => {
      try {
        parseStringsDictGroups(content, "m.stringsdict");
        return undefined;
      } catch (caught) {
        return caught as AdapterError;
      }
    })();
    expect(error?.code).toBe("INVALID_STRUCTURE");
  });
});

describe("parseAppleStringsDictEntries", () => {
  it("emits one suffixed TranslationEntry per category with placeholders extracted", () => {
    const entries = parseAppleStringsDictEntries(PHOTO_COUNT, "Localizable", "m.stringsdict");
    expect([...entries.keys()]).toEqual(["photo_count_one", "photo_count_other"]);
    const one = entries.get("photo_count_one");
    expect(one?.value).toBe("%d photo");
    expect(one?.isPlural).toBe(true);
    expect(one?.placeholders).toEqual(["%d"]);
    expect(one?.namespace).toBe("Localizable");
  });

  it("extracts %1$@ style positional placeholders inside a plural category value", () => {
    const content = stringsdict(
      "<key>k</key><dict><key>NSStringLocalizedFormatKey</key><string>%#@v@</string>" +
        "<key>v</key><dict><key>NSStringFormatSpecTypeKey</key><string>NSStringPluralRuleType</string>" +
        "<key>other</key><string>%1$@ has %2$d items</string></dict></dict>",
    );
    const entries = parseAppleStringsDictEntries(content, "ns", "m.stringsdict");
    expect(entries.get("k_other")?.placeholders).toEqual(["%1$@", "%2$d"]);
  });
});

describe("serializeAppleStringsDictEntries", () => {
  it("returns undefined when no plural entries are given", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "verbatra-stringsdict-")), "absent.stringsdict");
    const result = await serializeAppleStringsDictEntries(new Map(), path, nodeAdapterFs);
    expect(result).toBeUndefined();
  });

  it("synthesizes a fresh plist for a base key with no existing destination", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "verbatra-stringsdict-")), "absent.stringsdict");
    const entries = new Map([
      ["photo_count_one", pluralEntry("photo_count_one", "%d photo")],
      ["photo_count_other", pluralEntry("photo_count_other", "%d photos")],
    ]);
    const xml = await serializeAppleStringsDictEntries(entries, path, nodeAdapterFs);
    expect(xml).toContain("<!DOCTYPE plist");
    expect(xml).toContain("<key>photo_count</key>");
    expect(xml).toContain("%#@photo_count@");
    expect(xml).toContain("NSStringPluralRuleType");
    expect(xml).toContain("<string>d</string>");
    expect(xml).toContain("%d photo</string>");
    expect(xml).toContain("%d photos</string>");
  });

  it("always synthesizes NSStringFormatValueTypeKey d, the only value confirmed safe across vendor examples", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "verbatra-stringsdict-")), "absent.stringsdict");
    const entries = new Map([["k_other", pluralEntry("k_other", "%f left")]]);
    const xml = await serializeAppleStringsDictEntries(entries, path, nodeAdapterFs);
    expect(xml).toContain("<string>d</string>");
  });

  it("synthesizes value type d regardless of the category's own printf conversion", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "verbatra-stringsdict-")), "absent.stringsdict");
    const entries = new Map([["k_other", pluralEntry("k_other", "%@ items, no count")]]);
    const xml = await serializeAppleStringsDictEntries(entries, path, nodeAdapterFs);
    expect(xml).toContain("<string>d</string>");
  });

  it("synthesizes value type d when a category has no printf placeholder at all", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "verbatra-stringsdict-")), "absent.stringsdict");
    const entries = new Map([["k_other", pluralEntry("k_other", "no count here")]]);
    const xml = await serializeAppleStringsDictEntries(entries, path, nodeAdapterFs);
    expect(xml).toContain("<string>d</string>");
  });

  it("ignores an isPlural entry whose key does not match the suffix convention", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "verbatra-stringsdict-")), "absent.stringsdict");
    const entries = new Map([["not_suffixed", pluralEntry("not_suffixed", "value")]]);
    const xml = await serializeAppleStringsDictEntries(entries, path, nodeAdapterFs);
    expect(xml).toBeUndefined();
  });

  it("reuses the destination's format key, variable name, and value type on round trip", async () => {
    const path = await tempFile("m.stringsdict", PHOTO_COUNT);
    const entries = new Map([
      ["photo_count_one", pluralEntry("photo_count_one", "%d photo")],
      ["photo_count_other", pluralEntry("photo_count_other", "%d photos")],
    ]);
    const xml = await serializeAppleStringsDictEntries(entries, path, nodeAdapterFs);
    const groups = parseStringsDictGroups(xml as string, path);
    expect(groups.get("photo_count")?.formatKey).toBe("%#@photos@");
    expect(groups.get("photo_count")?.variableName).toBe("photos");
    expect(groups.get("photo_count")?.valueType).toBe("d");
    expect([...(groups.get("photo_count")?.categories.keys() ?? [])]).toEqual(["one", "other"]);
  });

  it("drops a category no longer present in the entries", async () => {
    const path = await tempFile("m.stringsdict", PHOTO_COUNT);
    const entries = new Map([["photo_count_other", pluralEntry("photo_count_other", "%d photos")]]);
    const xml = await serializeAppleStringsDictEntries(entries, path, nodeAdapterFs);
    const groups = parseStringsDictGroups(xml as string, path);
    expect([...(groups.get("photo_count")?.categories.keys() ?? [])]).toEqual(["other"]);
  });

  it("drops a whole base key no longer present in the entries, leaving an empty plist", async () => {
    const path = await tempFile("m.stringsdict", PHOTO_COUNT);
    const xml = await serializeAppleStringsDictEntries(new Map(), path, nodeAdapterFs);
    expect(xml).toContain("<dict/>");
    const groups = parseStringsDictGroups(xml as string, path);
    expect(groups.size).toBe(0);
  });

  it("appends a new base key not present in the destination after the existing ones", async () => {
    const path = await tempFile("m.stringsdict", PHOTO_COUNT);
    const entries = new Map([
      ["photo_count_one", pluralEntry("photo_count_one", "%d photo")],
      ["photo_count_other", pluralEntry("photo_count_other", "%d photos")],
      ["video_count_other", pluralEntry("video_count_other", "%d videos")],
    ]);
    const xml = await serializeAppleStringsDictEntries(entries, path, nodeAdapterFs);
    const groups = parseStringsDictGroups(xml as string, path);
    expect([...groups.keys()]).toEqual(["photo_count", "video_count"]);
    expect(groups.get("video_count")?.variableName).toBe("video_count");
  });

  it("raises INPUT_TOO_LARGE for an oversized destination stringsdict", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verbatra-stringsdict-"));
    const path = join(dir, "big.stringsdict");
    await writeFile(path, new Uint8Array(MAX_INPUT_BYTES + 1));
    const entries = new Map([["k_other", pluralEntry("k_other", "%d")]]);
    const error = await serializeAppleStringsDictEntries(entries, path, nodeAdapterFs).catch(
      (caught: unknown) => caught,
    );
    expect((error as AdapterError).code).toBe("INPUT_TOO_LARGE");
  });

  it("swallows a non-ENOENT sibling read failure when there are no plural entries to write", async () => {
    const file = await tempFile("blocker.stringsdict", "");
    const underAFile = join(file, "child.stringsdict");
    const result = await serializeAppleStringsDictEntries(new Map(), underAFile, nodeAdapterFs);
    expect(result).toBeUndefined();
  });

  it("still raises for a non-ENOENT sibling read failure when there are plural entries to write", async () => {
    const file = await tempFile("blocker.stringsdict", "");
    const underAFile = join(file, "child.stringsdict");
    const entries = new Map([["k_other", pluralEntry("k_other", "%d")]]);
    const error = await serializeAppleStringsDictEntries(entries, underAFile, nodeAdapterFs).catch(
      (caught: unknown) => caught,
    );
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });
});
