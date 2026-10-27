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

describe("xliff round-trip: every inline element keeps its specified attributes", () => {
  it.each([
    ['<g id="1" ctype="bold" ts="t" clone="no" xid="u2" equiv-text="b">word</g>'],
    ['<x id="1" ctype="image" ts="t" clone="yes" xid="u2" equiv-text="{0}"/>'],
    ['<bx id="1" rid="r" ctype="bold" ts="t" clone="no" xid="u2" equiv-text="["/>'],
    ['<ex id="2" rid="r" ts="t" xid="u2" equiv-text="]"/>'],
    ['<bpt id="1" rid="r" ctype="bold" ts="t" crc="c" xid="u2" equiv-text="["><b></bpt>'],
    ['<ept id="1" rid="r" ts="t" crc="c" xid="u2" equiv-text="]"></b></ept>'],
    ['<ph id="1" ctype="image" ts="t" crc="c" assoc="p" xid="u2" equiv-text="img"><img/></ph>'],
    ['<it id="1" pos="open" rid="r" ctype="bold" ts="t" crc="c" xid="u2" equiv-text="["><b></it>'],
    ['<mrk mtype="term" mid="m1" ts="t" comment="c">word</mrk>'],
    ['<ph id="1"><a title="<sub datatype="html" ctype="x-title" xid="u3">Sub flow</sub>"></ph>'],
  ])("round-trips the XLIFF 1.2 value %j", async (value) => {
    const { value: read, file } = await writeThenRead(XLIFF_12, value);
    expect(read).toBe(value);
    expect(file).toContain(`<target>${value.slice(0, value.indexOf(" "))} `);
  });

  it.each([
    [
      '<ph id="1" canCopy="no" canDelete="no" canReorder="no" copyOf="0" dataRef="d1" disp="{0}" equiv="n" subFlows="u2" subType="xlf:var" type="fmt"/>',
    ],
    [
      '<pc id="1" canCopy="no" canDelete="no" canOverlap="yes" canReorder="no" copyOf="0" dataRefEnd="d2" dataRefStart="d1" dir="rtl" dispEnd="]" dispStart="[" equivEnd="" equivStart="" subFlowsEnd="u3" subFlowsStart="u2" subType="xlf:b" type="fmt">bold</pc>',
    ],
    [
      '<sc id="1" canCopy="no" canDelete="no" canReorder="no" copyOf="0" dataRef="d1" disp="[" equiv="" subFlows="u2" subType="xlf:b" type="fmt" canOverlap="yes" dir="ltr" isolated="yes"/>',
    ],
    [
      '<ec id="2" canCopy="no" canDelete="no" canReorder="no" copyOf="0" dataRef="d2" disp="]" equiv="" subFlows="u2" subType="xlf:b" type="fmt" canOverlap="yes" dir="ltr" isolated="yes" startRef="1"/>',
    ],
    ['<mrk id="m1" translate="no" type="term" ref="#t1" value="v">word</mrk>'],
    ['<sm id="m2" translate="yes" type="comment" ref="#n1" value="v"/>x<em startRef="m2"/>'],
    ['A<cp hex="0001"/>B'],
  ])("round-trips the XLIFF 2.0 value %j", async (value) => {
    expect((await writeThenRead(XLIFF_20, value)).value).toBe(value);
  });

  it.each([
    [XLIFF_12, '<mrk mtype="term" id="1" translate="no">w</mrk>', '<mrk mtype="term">w</mrk>'],
    [XLIFF_12, '<x id="1" equiv="e" subFlows="u2"/>', '<x id="1"/>'],
    [XLIFF_20, '<ph id="1" dir="rtl" isolated="yes" ctype="x"/>', '<ph id="1"/>'],
    [XLIFF_20, '<pc id="1" isolated="yes" subFlows="u2">b</pc>', '<pc id="1">b</pc>'],
    [XLIFF_20, '<mrk id="1" mtype="term">w</mrk>', '<mrk id="1">w</mrk>'],
  ])(
    "drops attributes the element's own XLIFF version does not specify",
    async (doc, value, kept) => {
      expect((await writeThenRead(doc, value)).value).toBe(kept);
    },
  );
});

describe("xliff write: sub-flows and elements of the other version", () => {
  it("writes an XLIFF 1.2 sub-flow inside a code element as a live element", async () => {
    const { file } = await writeThenRead(
      XLIFF_12,
      '<ph id="1">&lt;a title="<sub>T</sub>"&gt;</ph>',
    );
    expect(file).toContain(
      '<target><ph id="1">&amp;lt;a title="<sub>T</sub>"&amp;gt;</ph></target>',
    );
  });

  it("writes a sub outside a code element as text and keeps the inline element beside it", async () => {
    const { file, value } = await writeThenRead(XLIFF_12, 'H<sub>2</sub>O <x id="1"/>');
    expect(file).toContain('<target>H&lt;sub&gt;2&lt;/sub&gt;O <x id="1"/></target>');
    expect(value).toBe('H<sub>2</sub>O <x id="1"/>');
  });

  it("keeps a native subscript opened inside a paired code as the code's text", async () => {
    const value = '<bpt id="1"><sub></bpt>2<ept id="1"></sub></ept>';
    const { file, value: read } = await writeThenRead(XLIFF_12, value);
    expect(file).toContain(
      '<target><bpt id="1">&lt;sub&gt;</bpt>2<ept id="1">&lt;/sub&gt;</ept></target>',
    );
    expect(read).toBe(value);
  });

  it("treats a sub-flow as text in an XLIFF 2.0 document", async () => {
    const { file } = await writeThenRead(XLIFF_20, '<ph id="1"/><sub>T</sub>');
    expect(file).toContain('<target><ph id="1"/>&lt;sub&gt;T&lt;/sub&gt;</target>');
  });

  it.each([
    '<x id="1"/>',
    '<g id="1">w</g>',
    '<bx id="1"/>',
    '<ex id="1"/>',
    '<it id="1" pos="open"/>',
  ])("treats the XLIFF 1.2 element %j as text in an XLIFF 2.0 document", async (value) => {
    const { file, value: read } = await writeThenRead(XLIFF_20, value);
    expect(file).toContain(
      `<target>${value.replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</target>`,
    );
    expect(read).toBe(value);
  });
});

describe("xliff round-trip: escaped text shaped like an inline element", () => {
  const escaped = `<xliff version="1.2"><file source-language="en" target-language="de"><body><trans-unit id="k"><source>S</source><target>&lt;x id="1"/&gt;</target></trans-unit></body></file></xliff>`;
  const live = escaped.replace('&lt;x id="1"/&gt;', '<x id="1"/>');

  it("reads escaped text that matches an allow-listed element exactly like the live element", async () => {
    const adapter = createXliffAdapter(createMemoryAdapterFs({ a: escaped, b: live }));
    const a = (await adapter.read("a", "de")).resource.entries.get("k")?.value;
    const b = (await adapter.read("b", "de")).resource.entries.get("k")?.value;
    expect(a).toBe('<x id="1"/>');
    expect(b).toBe(a);
  });

  it("writes such text back as the live element", async () => {
    const fs = createMemoryAdapterFs({ "m.xlf": escaped });
    const adapter = createXliffAdapter(fs);
    const { resource } = await adapter.read("m.xlf", "de");
    await adapter.write(resource, "m.xlf");
    expect(fs.files.get("m.xlf")).toContain('<target><x id="1"/></target>');
  });
});

describe("xliff read: placeholders match the adapter's own comparison", () => {
  it.each([
    [XLIFF_12, '<target>&lt;em&gt;w&lt;/em&gt; <x id="1"/></target>', ["<em>", '<x id="1"/>']],
    [
      XLIFF_20,
      '<target><em startRef="1"/> &lt;x id="1"/&gt;</target>',
      ['<em startRef="1"/>', '<x id="1"/>'],
    ],
  ])("extracts the inline elements of either version", async (document, target, expected) => {
    const content = document.replace("<target>Ziel</target>", target);
    const adapter = createXliffAdapter(createMemoryAdapterFs({ "m.xlf": content }));
    const { resource } = await adapter.read("m.xlf", "de");
    expect(resource.entries.get("k")?.placeholders).toEqual(expected);
  });
});

describe("xliff write: values that cannot stay markup fall back to text", () => {
  it.each([
    ["1.2", XLIFF_12, '<ph id="1" xmlns="urn:example:other"/> & <x id="2"/>'],
    ["2.0", XLIFF_20, '<ph id="1" xmlns="urn:example:other"/> & <pc id="2">b</pc>'],
    ["1.2", XLIFF_12, '<g id="1">unclosed'],
    ["2.0", XLIFF_20, '<pc id="1">unclosed'],
  ])("writes an XLIFF %s value %j entirely as text", async (_label, document, value) => {
    const { file, value: read } = await writeThenRead(document, value);
    expect(file).toContain(
      `<target>${value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</target>`,
    );
    expect(read).toBe(value);
  });
});
