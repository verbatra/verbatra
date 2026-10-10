import { describe, expect, it } from "vitest";
import { createMemoryAdapterFs } from "../test-support.js";
import { createXliffAdapter } from "./xliff-adapter.js";

const PATH = "/locales/de.xlf";

const DOCUMENT = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">',
  '  <file source-language="en" target-language="de" datatype="plaintext" original="app">',
  "    <body>",
  '      <trans-unit id="hello">',
  "        <source>Hello</source>",
  '        <target state="translated">Hallo</target>',
  "      </trans-unit>",
  "    </body>",
  "  </file>",
  "</xliff>",
].join("\n");

async function rewrite(content: string, value: string): Promise<string> {
  const fs = createMemoryAdapterFs({ [PATH]: content });
  const adapter = createXliffAdapter(fs);
  const { resource } = await adapter.read(PATH, "de");
  const entries = new Map(resource.entries);
  const hello = entries.get("hello");
  if (hello !== undefined) {
    entries.set("hello", { ...hello, value });
  }
  await adapter.write({ ...resource, entries }, PATH);
  return fs.files.get(PATH) ?? "";
}

describe("xliff writer: trailing newline", () => {
  it.each([
    ["a newline", "\n"],
    ["a CRLF", "\r\n"],
    ["no line break", ""],
  ])("keeps a file that ends with %s ending the same way", async (_label, ending) => {
    const content = `${DOCUMENT.replaceAll("\n", ending === "" ? "\n" : ending)}${ending}`;

    const written = await rewrite(content, "Servus");

    expect(written.endsWith(`</xliff>${ending}`)).toBe(true);
    expect(written).toContain("Servus");
  });

  it("round-trips an unchanged file byte for byte, trailing newline included", async () => {
    const content = `${DOCUMENT}\n`;

    expect(await rewrite(content, "Hallo")).toBe(content);
  });
});

const UNTRANSLATED = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">',
  '  <file source-language="en" target-language="de" datatype="plaintext" original="app">',
  "    <body>",
  '      <trans-unit id="hello">',
  "        <source>Hello</source>",
  "        <note>greeting</note>",
  "      </trans-unit>",
  "    </body>",
  "  </file>",
  "</xliff>",
  "",
].join("\n");

const SOURCE_WITH_TARGET = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">',
  '  <file source-language="en" datatype="plaintext" original="app">',
  "    <body>",
  '      <trans-unit id="hello">',
  "        <source>Hello</source>",
  '        <target state="final">Hello</target>',
  "      </trans-unit>",
  '      <trans-unit id="bye">',
  "        <source>Bye</source>",
  '        <target state="final">Bye</target>',
  "      </trans-unit>",
  "    </body>",
  "  </file>",
  "</xliff>",
  "",
].join("\n");

describe("xliff writer: new target layout", () => {
  it("puts a target added after a multi-line source on its own line at the source's indentation", async () => {
    const fs = createMemoryAdapterFs({ [PATH]: UNTRANSLATED });
    const entry = {
      key: "hello",
      namespace: "app",
      value: "Hallo",
      placeholders: [],
      isPlural: false,
    };

    await createXliffAdapter(fs).write(
      { locale: "de", namespace: "app", format: "xliff", entries: new Map([["hello", entry]]) },
      PATH,
    );
    const written = fs.files.get(PATH) ?? "";

    expect(written).toBe(
      UNTRANSLATED.replace(
        "        <source>Hello</source>\n",
        "        <source>Hello</source>\n        <target>Hallo</target>\n",
      ),
    );
  });

  it("leaves no whitespace-only line where a copied source unit's own target was dropped", async () => {
    const destination = SOURCE_WITH_TARGET.replace(
      ' datatype="plaintext"',
      ' target-language="de" datatype="plaintext"',
    )
      .split("\n")
      .filter((_line, index) => index < 8 || index > 11)
      .join("\n");
    const fs = createMemoryAdapterFs({ "/en.xlf": SOURCE_WITH_TARGET, [PATH]: destination });
    const adapter = createXliffAdapter(fs);
    const entry = {
      key: "bye",
      namespace: "app",
      value: "Tschuess",
      placeholders: [],
      isPlural: false,
    };

    await adapter.write(
      { locale: "de", namespace: "app", format: "xliff", entries: new Map([["bye", entry]]) },
      PATH,
      { sourcePath: "/en.xlf" },
    );
    const written = fs.files.get(PATH) ?? "";

    expect(written.split("\n").filter((line) => line.length > 0 && line.trim() === "")).toEqual([]);
    expect(written).toContain(
      [
        '      <trans-unit id="bye">',
        "        <source>Bye</source>",
        "        <target>Tschuess</target>",
        "      </trans-unit>",
      ].join("\n"),
    );
  });
});
