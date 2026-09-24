import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { createMemoryAdapterFs } from "../test-support.js";
import { createXliffAdapter } from "./xliff-adapter.js";

const XLIFF_12 = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2"><file source-language="en" target-language="de"><body>
<trans-unit id="k"><source>Source</source><target>Ziel</target></trans-unit>
</body></file></xliff>`;

const XLIFF_12_NAMESPACED = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:1.2" version="1.2"><file source-language="en" target-language="de"><body>
<trans-unit id="k"><source>Source</source><target>Ziel</target></trans-unit>
</body></file></xliff>`;

const XLIFF_20 = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="de"><file id="f"><unit id="k"><segment><source>Source</source><target>Ziel</target></segment></unit></file></xliff>`;

const DOCUMENTS = [
  ["1.2", XLIFF_12],
  ["1.2 namespaced", XLIFF_12_NAMESPACED],
  ["2.0", XLIFF_20],
] as const;

const TEXT_CASES = [
  "A & B",
  "a < b",
  "a > b",
  "1 < 2 && 3 > 2",
  'Say "hi"',
  "It's here",
  "&amp;",
  "&lt;tag&gt;",
  "&#169; 2026",
  "&unknown;",
  "&",
  "<",
  "<b>bold</b>",
  "<script>alert(1)</script>",
  "<!-- not a comment -->",
  "]]>",
  "  padded  ",
  "Tab\tseparated",
  "line one\nline two",
  "{name} & {count}",
];

const MARKUP_CASES = [
  'Hello <x id="1"/>',
  'Click <x id="1"/> & go',
  'Read <g id="1">the docs &amp; FAQ</g> now',
  'Nested <g id="1">a <g id="2">b &lt; c</g></g>',
  '<ph id="1"/> < <ph id="2"/>',
  '<x id="1" equiv-text="{{ a &amp; b }}"/> & text',
  'Mixed <x id="1"/> <b>not inline</b> "quoted" &amp;',
];

const XLIFF_12_MARKUP_CASES = [
  'Press <bpt id="1"><b></bpt>here<ept id="1"></b></ept> & done',
  '<bpt id="1" ctype="bold"><strong class="x"></bpt>A &amp; B<ept id="1"></strong></ept>',
];

const XLIFF_20_MARKUP_CASES = [
  '<pc id="1" dispStart="&lt;b&gt;" dispEnd="&lt;/b&gt;">bold & brave</pc>',
  '<ph id="0" equiv="INTERPOLATION" disp="{{ name }}"/> & <sc id="1"/>x<ec startRef="1"/>',
  'A<cp hex="0001"/>B',
];

function entry(value: string): TranslationEntry {
  return { key: "k", namespace: "m", value, placeholders: [], isPlural: false };
}

function resourceWith(value: string): LocaleResource {
  return { locale: "de", namespace: "m", format: "xliff", entries: new Map([["k", entry(value)]]) };
}

async function writeThenRead(document: string, value: string, cycles = 1) {
  const fs = createMemoryAdapterFs({ "m.xlf": document });
  const adapter = createXliffAdapter(fs);
  let read = value;
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    await adapter.write(resourceWith(read), "m.xlf");
    const { resource } = await adapter.read("m.xlf", "de");
    read = resource.entries.get("k")?.value ?? "";
  }
  return { value: read, file: fs.files.get("m.xlf") ?? "" };
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const FRAGMENTS = [
  "a",
  " ",
  "&",
  "<",
  ">",
  '"',
  "'",
  "&amp;",
  "&lt;",
  "&#38;",
  "&quot;",
  "{n}",
  "<b>",
  "</b>",
  '<x id="1"/>',
  '<ph id="2"/>',
];

function randomValue(next: () => number): string {
  const length = Math.floor(next() * 12);
  let value = "";
  for (let i = 0; i < length; i += 1) {
    value += FRAGMENTS[Math.floor(next() * FRAGMENTS.length)] ?? "";
  }
  if (value !== "" && next() < 0.3) {
    value = `<g id="9">${value}</g>`;
  }
  return value;
}

describe("xliff round-trip: text is escaped exactly once", () => {
  describe.each(DOCUMENTS)("in an XLIFF %s document", (_label, document) => {
    it.each(TEXT_CASES)("reads back %j unchanged", async (value) => {
      expect((await writeThenRead(document, value)).value).toBe(value);
    });

    it.each(MARKUP_CASES)("preserves inline markup in %j", async (value) => {
      expect((await writeThenRead(document, value)).value).toBe(value);
    });

    it.each([...TEXT_CASES, ...MARKUP_CASES])(
      "keeps %j stable over repeated write and read cycles",
      async (value) => {
        expect((await writeThenRead(document, value, 4)).value).toBe(value);
      },
    );

    it("agrees on every value of a seeded random corpus", async () => {
      const next = seededRandom(20_260_924);
      const failures: string[] = [];
      for (let i = 0; i < 200; i += 1) {
        const value = randomValue(next);
        if (value.trim() === "") {
          continue;
        }
        if ((await writeThenRead(document, value)).value !== value) {
          failures.push(value);
        }
      }
      expect(failures).toEqual([]);
    });
  });

  it.each(XLIFF_12_MARKUP_CASES)("preserves XLIFF 1.2 paired codes in %j", async (value) => {
    expect((await writeThenRead(XLIFF_12, value)).value).toBe(value);
  });

  it.each(XLIFF_20_MARKUP_CASES)("preserves XLIFF 2.0 inline codes in %j", async (value) => {
    expect((await writeThenRead(XLIFF_20, value)).value).toBe(value);
  });
});

describe("xliff round-trip: what lands in the file", () => {
  it("writes an ampersand, a less-than and a greater-than sign as one entity each", async () => {
    const { file } = await writeThenRead(XLIFF_12, "A & B < C > D");
    expect(file).toContain("<target>A &amp; B &lt; C &gt; D</target>");
  });

  it("writes an existing entity as literal text, escaping its ampersand once", async () => {
    const { file } = await writeThenRead(XLIFF_12, "&amp; &lt;");
    expect(file).toContain("<target>&amp;amp; &amp;lt;</target>");
  });

  it("writes inline markup as elements and the text around it as escaped text", async () => {
    const { file } = await writeThenRead(XLIFF_12, 'A & <g id="1">B < C</g> <b>');
    expect(file).toContain('<target>A &amp; <g id="1">B &lt; C</g> &lt;b&gt;</target>');
  });

  it("writes an inline element into a namespaced document without a namespace reset", async () => {
    const { file } = await writeThenRead(XLIFF_12_NAMESPACED, 'A <x id="1"/>');
    expect(file).toContain('<target>A <x id="1"/></target>');
  });

  it("writes paired XLIFF 1.2 codes with their native markup escaped inside them", async () => {
    const { file } = await writeThenRead(XLIFF_12, '<bpt id="1"><b></bpt>x<ept id="1"></b></ept>');
    expect(file).toContain(
      '<target><bpt id="1">&lt;b&gt;</bpt>x<ept id="1">&lt;/b&gt;</ept></target>',
    );
  });

  it("canonicalizes an empty paired element to its self-closing form, then keeps it stable", async () => {
    const first = await writeThenRead(XLIFF_12, 'A <g id="1"></g>');
    expect(first.value).toBe('A <g id="1"/>');
    expect((await writeThenRead(XLIFF_12, first.value, 3)).value).toBe(first.value);
  });

  it("treats an XLIFF 2.0 element name as text in an XLIFF 1.2 document", async () => {
    const { file, value } = await writeThenRead(XLIFF_12, "<em>word</em>");
    expect(file).toContain("<target>&lt;em&gt;word&lt;/em&gt;</target>");
    expect(value).toBe("<em>word</em>");
  });
});

describe("xliff read: decoding what a file carries", () => {
  async function readTarget(target: string): Promise<string | undefined> {
    const document = `<xliff version="1.2"><file source-language="en" target-language="de"><body><trans-unit id="k"><source>S</source><target>${target}</target></trans-unit></body></file></xliff>`;
    const fs = createMemoryAdapterFs({ "m.xlf": document });
    const { resource } = await createXliffAdapter(fs).read("m.xlf", "de");
    return resource.entries.get("k")?.value;
  }

  it.each([
    ["A &amp; B", "A & B"],
    ["A &amp;amp; B", "A &amp; B"],
    ["&lt;b&gt;", "<b>"],
    ["&#169; &#x41;", "© A"],
    ["&quot;q&quot; &apos;a&apos;", `"q" 'a'`],
    ["<![CDATA[A & <b>]]>", "A & <b>"],
    ["A<!-- note -->B", "AB"],
    ["line\r\nbreak", "line\nbreak"],
    [
      '<x id="1" equiv-text="a &amp; &quot;b&quot;"/>',
      '<x id="1" equiv-text="a &amp; &quot;b&quot;"/>',
    ],
  ])("reads %j as %j", async (target, expected) => {
    expect(await readTarget(target)).toBe(expected);
  });
});

describe("xliff read: nesting limit", () => {
  it("rejects a target nesting inline elements past the depth limit as MAX_DEPTH_EXCEEDED", async () => {
    const depth = 150;
    const target = `${'<g id="1">'.repeat(depth)}deep${"</g>".repeat(depth)}`;
    const document = `<xliff version="1.2"><file source-language="en" target-language="de"><body><trans-unit id="k"><source>S</source><target>${target}</target></trans-unit></body></file></xliff>`;
    const fs = createMemoryAdapterFs({ "m.xlf": document });
    await expect(createXliffAdapter(fs).read("m.xlf", "de")).rejects.toMatchObject({
      code: "MAX_DEPTH_EXCEEDED",
    });
  });
});
