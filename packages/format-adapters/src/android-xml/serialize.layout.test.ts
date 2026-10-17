import type { TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { createMemoryAdapterFs } from "../test-support.js";
import { createAndroidXmlAdapter } from "./android-xml-adapter.js";

const PATH = "/res/values-de/strings.xml";

function entry(key: string, value: string): TranslationEntry {
  return { key, namespace: "strings", value, placeholders: [], isPlural: false };
}

async function writeOver(existing: string | undefined, values: Record<string, string>) {
  const fs = createMemoryAdapterFs(existing === undefined ? {} : { [PATH]: existing });
  const adapter = createAndroidXmlAdapter(fs);
  const entries =
    existing === undefined ? new Map() : (await adapter.read(PATH, "de")).resource.entries;
  const merged = new Map(entries);
  for (const [key, value] of Object.entries(values)) {
    merged.set(key, entry(key, value));
  }
  await adapter.write(
    { locale: "de", namespace: "strings", format: "android-xml", entries: merged },
    PATH,
  );
  return fs.files.get(PATH) ?? "";
}

const EXISTING = [
  '<?xml version="1.0" encoding="utf-8"?>',
  "<resources>",
  '    <string name="hello">Hallo</string>',
  '    <plurals name="items">',
  '        <item quantity="one">%d Eintrag</item>',
  "    </plurals>",
  "</resources>",
  "",
].join("\n");

describe("android-xml writer: layout", () => {
  it("indents a new string like its siblings and keeps the trailing newline", async () => {
    expect(await writeOver(EXISTING, { bye: "Tschüss" })).toBe(
      EXISTING.replace(
        "    </plurals>\n</resources>",
        '    </plurals>\n    <string name="bye">Tschüss</string>\n</resources>',
      ),
    );
  });

  it("indents a new plural item like the items beside it", async () => {
    expect(await writeOver(EXISTING, { "items[other]": "%d Einträge" })).toBe(
      EXISTING.replace(
        "%d Eintrag</item>\n",
        '%d Eintrag</item>\n        <item quantity="other">%d Einträge</item>\n',
      ),
    );
  });

  it("indents a new plurals block and its items one level deeper", async () => {
    const written = await writeOver(EXISTING, {
      "files[one]": "%d Datei",
      "files[other]": "%d Dateien",
    });

    expect(written).toContain(
      [
        '    <plurals name="files">',
        '        <item quantity="one">%d Datei</item>',
        '        <item quantity="other">%d Dateien</item>',
        "    </plurals>",
        "</resources>",
        "",
      ].join("\n"),
    );
  });

  it("lays out a file it creates one resource per indented line", async () => {
    expect(await writeOver(undefined, { hello: "Hallo", "items[one]": "%d Eintrag" })).toBe(
      [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<resources>",
        '    <string name="hello">Hallo</string>',
        '    <plurals name="items">',
        '        <item quantity="one">%d Eintrag</item>',
        "    </plurals>",
        "</resources>",
        "",
      ].join("\n"),
    );
  });

  it("round-trips an unchanged file byte for byte", async () => {
    expect(await writeOver(EXISTING, {})).toBe(EXISTING);
  });
});
