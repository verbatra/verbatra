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
