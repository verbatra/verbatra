import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { WriteContext } from "../adapter.js";
import { AdapterError } from "../errors.js";
import { createMemoryAdapterFs } from "../test-support.js";
import { createXliffAdapter } from "./xliff-adapter.js";

const SOURCE_12 = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" original="messages" datatype="plaintext">
    <body>
      <trans-unit id="a"><source>Alpha</source></trans-unit>
      <trans-unit id="b"><source>Beta</source></trans-unit>
      <trans-unit id="c" resname="gamma" translate="yes"><source>Gamma <x id="1"/></source><note from="dev">third letter</note></trans-unit>
    </body>
  </file>
</xliff>
`;

const TARGET_12 = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2">
  <file source-language="en" target-language="de" original="messages" datatype="plaintext">
    <body>
      <trans-unit id="a"><source>Alpha</source><target>Alfa</target></trans-unit>
      <trans-unit id="b"><source>Beta</source><target>Beta</target></trans-unit>
    </body>
  </file>
</xliff>
`;

const SOURCE_20 = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en"><file id="f1">
<unit id="a"><segment><source>Alpha</source></segment></unit>
<unit id="m" name="multi"><notes><note>two parts</note></notes><segment><source>One.</source><target>stale</target></segment><segment><source>Two.</source></segment></unit>
</file></xliff>`;

const TARGET_20 = `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="en" trgLang="de"><file id="f1">
<unit id="a"><segment><source>Alpha</source><target>Alfa</target></segment></unit>
</file></xliff>`;

function entry(key: string, value: string, description?: string): TranslationEntry {
  return {
    key,
    namespace: "messages",
    value,
    placeholders: [],
    isPlural: false,
    ...(description !== undefined ? { description } : {}),
  };
}

function resource(entries: readonly TranslationEntry[], locale = "de"): LocaleResource {
  return {
    locale,
    namespace: "messages",
    format: "xliff",
    entries: new Map(entries.map((item) => [item.key, item])),
  };
}

function setup(files: Record<string, string>) {
  const fs = createMemoryAdapterFs(files);
  return { fs, adapter: createXliffAdapter(fs) };
}

async function writeAndRead(
  files: Record<string, string>,
  entries: readonly TranslationEntry[],
  context: WriteContext = { sourcePath: "en.xlf" },
) {
  const { fs, adapter } = setup(files);
  await adapter.write(resource(entries), "de.xlf", context);
  const { resource: read } = await adapter.read("de.xlf", "de");
  const values = Object.fromEntries([...read.entries].map(([key, item]) => [key, item.value]));
  return { file: fs.files.get("de.xlf") ?? "", values, adapter, fs };
}

async function writeError(
  files: Record<string, string>,
  entries: readonly TranslationEntry[],
  context: WriteContext,
): Promise<AdapterError> {
  const { adapter } = setup(files);
  const error = await adapter.write(resource(entries), "de.xlf", context).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AdapterError);
  return error as AdapterError;
}

describe("xliff write: a unit the destination lacks is added from the source", () => {
  it("appends a copy of the source unit with its id, attributes, note and source, plus the target", async () => {
    const { file, values } = await writeAndRead({ "en.xlf": SOURCE_12, "de.xlf": TARGET_12 }, [
      entry("a", "Alfa"),
      entry("b", "Beta"),
      entry("c", 'Gamma <x id="1"/> de'),
    ]);

    expect(file).toContain(
      '      <trans-unit id="c" resname="gamma" translate="yes"><source>Gamma <x id="1"/></source><target>Gamma <x id="1"/> de</target><note from="dev">third letter</note></trans-unit>\n    </body>',
    );
    expect(values).toEqual({ a: "Alfa", b: "Beta", c: 'Gamma <x id="1"/> de' });
  });

  it("writes each unit once, so a second identical write leaves the file unchanged", async () => {
    const first = await writeAndRead({ "en.xlf": SOURCE_12, "de.xlf": TARGET_12 }, [
      entry("c", "Gamma de"),
    ]);
    await first.adapter.write(resource([entry("c", "Gamma de")]), "de.xlf", {
      sourcePath: "en.xlf",
    });
    const second = first.fs.files.get("de.xlf") ?? "";
    expect(second).toBe(first.file);
    expect(second.match(/id="c"/g)).toHaveLength(1);
  });

  it("appends into the <file> whose original matches the source unit's file", async () => {
    const source = `<xliff version="1.2"><file source-language="en" original="one"><body><trans-unit id="a"><source>A</source></trans-unit></body></file><file source-language="en" original="two"><body><trans-unit id="z"><source>Z</source></trans-unit></body></file></xliff>`;
    const target = `<xliff version="1.2"><file source-language="en" target-language="de" original="one"><body></body></file><file source-language="en" target-language="de" original="two"><body></body></file></xliff>`;
    const { file } = await writeAndRead({ "en.xlf": source, "de.xlf": target }, [
      entry("a", "Ah"),
      entry("z", "Zett"),
    ]);
    expect(file).toContain(
      '<file source-language="en" target-language="de" original="one"><body><trans-unit id="a"><source>A</source><target>Ah</target></trans-unit></body></file>',
    );
    expect(file).toContain(
      'original="two"><body><trans-unit id="z"><source>Z</source><target>Zett</target></trans-unit></body>',
    );
  });

  it("appends a copy of an XLIFF 2.0 unit once, filling every missing segment and dropping source targets", async () => {
    const { file, values } = await writeAndRead({ "en.xlf": SOURCE_20, "de.xlf": TARGET_20 }, [
      entry("m#0", "Eins."),
      entry("m#1", "Zwei."),
    ]);
    expect(file).toContain(
      '<unit id="m" name="multi"><notes><note>two parts</note></notes><segment><source>One.</source><target>Eins.</target></segment><segment><source>Two.</source><target>Zwei.</target></segment></unit>\n</file>',
    );
    expect(file).not.toContain("stale");
    expect(values).toEqual({ a: "Alfa", "m#0": "Eins.", "m#1": "Zwei." });
  });

  it("leaves a segment it was given no value for without a target", async () => {
    const { values } = await writeAndRead({ "en.xlf": SOURCE_20, "de.xlf": TARGET_20 }, [
      entry("m#1", "Zwei."),
    ]);
    expect(values).toEqual({ a: "Alfa", "m#1": "Zwei." });
  });
});

describe("xliff write: what a copied unit keeps", () => {
  it("drops only the unit's own targets and alt-trans, keeping targets nested elsewhere", async () => {
    const source = `<xliff version="1.2"><file source-language="en" original="messages"><body><trans-unit id="c"><source>Gamma</source><target>old</target><alt-trans><source>Gamma</source><target>memory</target></alt-trans><note>n</note></trans-unit></body></file></xliff>`;
    const { file } = await writeAndRead({ "en.xlf": source, "de.xlf": TARGET_12 }, [
      entry("c", "Gamma de"),
    ]);
    expect(file).toContain(
      '<trans-unit id="c"><source>Gamma</source><target>Gamma de</target><note>n</note></trans-unit>',
    );
    expect(file).not.toContain("alt-trans");
    expect(file).not.toContain("old");
  });

  it("keeps a target inside an XLIFF 2.0 module element while dropping segment and ignorable targets", async () => {
    const source = `<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" xmlns:mtc="urn:oasis:names:tc:xliff:matches:2.0" version="2.0" srcLang="en"><file id="f1"><unit id="k"><mtc:matches><mtc:match ref="#k"><source>Hi</source><target>Salut</target></mtc:match></mtc:matches><segment><source>Hi</source><target>stale</target></segment><ignorable><source> </source><target> </target></ignorable></unit></file></xliff>`;
    const { file, values } = await writeAndRead({ "en.xlf": source, "de.xlf": TARGET_20 }, [
      entry("k", "Hallo"),
    ]);
    expect(file).toContain("<target>Salut</target></mtc:match>");
    expect(file).toContain("<segment><source>Hi</source><target>Hallo</target></segment>");
    expect(file).toContain("<ignorable><source> </source></ignorable>");
    expect(file).not.toContain("stale");
    expect(values.k).toBe("Hallo");
  });

  it("marks a copied XLIFF 2.0 segment in state initial as translated", async () => {
    const source = SOURCE_20.replace(
      "<segment><source>Two.</source>",
      '<segment state="initial" subState="x:pending"><source>Two.</source>',
    );
    const { file } = await writeAndRead({ "en.xlf": source, "de.xlf": TARGET_20 }, [
      entry("m#1", "Zwei."),
    ]);
    expect(file).toContain(
      '<segment state="translated"><source>Two.</source><target>Zwei.</target></segment>',
    );
  });
});

describe("xliff write: a value it cannot place is refused, never dropped", () => {
  it("refuses a key missing from the destination when no source path is known", async () => {
    const error = await writeError(
      { "en.xlf": SOURCE_12, "de.xlf": TARGET_12 },
      [entry("c", "Gamma")],
      {},
    );
    expect(error.code).toBe("INVALID_STRUCTURE");
    expect(error.message).toContain('"c"');
    expect(error.message).toContain("none to copy");
  });

  it.each([
    ["cannot be read", "missing.xlf", {}, /source XLIFF file could not be read/],
    [
      "is not valid XML",
      "en.xlf",
      { "en.xlf": "<xliff" },
      /source XLIFF file is not a valid XLIFF/,
    ],
    [
      "is not an XLIFF document",
      "en.xlf",
      { "en.xlf": "<root/>" },
      /source XLIFF file is not a valid XLIFF/,
    ],
  ])(
    "reports a source file that %s on its own, not as having no unit to copy",
    async (_label, sourcePath, files, message) => {
      const error = await writeError({ "de.xlf": TARGET_12, ...files }, [entry("c", "Gamma")], {
        sourcePath,
      });
      expect(error.code).toBe("INVALID_STRUCTURE");
      expect(error.message).toMatch(message);
      expect(error.message).not.toContain("none to copy");
    },
  );

  it("refuses a key the source document does not carry either", async () => {
    const error = await writeError(
      { "en.xlf": SOURCE_12, "de.xlf": TARGET_12 },
      [entry("ghost", "Boo")],
      { sourcePath: "en.xlf" },
    );
    expect(error.message).toContain('"ghost"');
  });

  it("refuses to copy a unit from a source document of another XLIFF version", async () => {
    const error = await writeError(
      { "en.xlf": SOURCE_20, "de.xlf": TARGET_12 },
      [entry("m#0", "Eins.")],
      { sourcePath: "en.xlf" },
    );
    expect(error.code).toBe("INVALID_STRUCTURE");
  });

  it("refuses a segment whose XLIFF 2.0 unit already exists in the destination", async () => {
    const target = TARGET_20.replace(
      "</file>",
      '<unit id="m"><segment><source>One.</source></segment></unit></file>',
    );
    const error = await writeError(
      { "en.xlf": SOURCE_20, "de.xlf": target },
      [entry("m#1", "Zwei.")],
      { sourcePath: "en.xlf" },
    );
    expect(error.message).toContain('"m#1"');
  });

  it.each([
    ["no <file> element", '<xliff version="1.2"></xliff>', /no <file>/],
    [
      "a <file> without a <body>",
      '<xliff version="1.2"><file source-language="en"/></xliff>',
      /without a <body>/,
    ],
  ])("refuses a destination with %s", async (_label, target, message) => {
    const error = await writeError(
      { "en.xlf": SOURCE_12, "de.xlf": target },
      [entry("a", "Alfa")],
      { sourcePath: "en.xlf" },
    );
    expect(error.message).toMatch(message);
  });
});

describe("xliff write: writing the source document itself", () => {
  async function writeSource(entries: readonly TranslationEntry[], source = SOURCE_12) {
    const { fs, adapter } = setup({ "en.xlf": source });
    await adapter.write(resource(entries, "en"), "en.xlf", { sourcePath: "en.xlf" });
    const { resource: read } = await adapter.read("en.xlf", "en");
    const values = Object.fromEntries([...read.entries].map(([key, item]) => [key, item.value]));
    return { file: fs.files.get("en.xlf") ?? "", values };
  }

  it("updates <source> in place and never adds a <target>", async () => {
    const { file, values } = await writeSource([entry("a", "Alpha!")]);
    expect(file).toContain('<trans-unit id="a"><source>Alpha!</source></trans-unit>');
    expect(file).not.toContain("<target>");
    expect(values.a).toBe("Alpha!");
  });

  it("appends a new key as a source-only XLIFF 1.2 unit carrying its description as a note", async () => {
    const { file, values } = await writeSource([entry("d", "Delta", "fourth letter")]);
    expect(file).toContain(
      '      <trans-unit id="d"><source>Delta</source><note>fourth letter</note></trans-unit>\n    </body>',
    );
    expect(values.d).toBe("Delta");
  });

  it("appends a new key as a source-only XLIFF 2.0 unit with its notes first", async () => {
    const { file, values } = await writeSource(
      [entry("d", "Delta", "fourth"), entry("e", "Echo")],
      SOURCE_20,
    );
    expect(file).toContain(
      '<unit id="d"><notes><note>fourth</note></notes><segment><source>Delta</source></segment></unit>',
    );
    expect(file).toContain('<unit id="e"><segment><source>Echo</source></segment></unit>');
    expect(values).toMatchObject({ d: "Delta", e: "Echo" });
  });

  it.each(["z#0", "has space", "#lead"])(
    "refuses to append the key %j as a source-only XLIFF 2.0 unit id",
    async (key) => {
      const { adapter } = setup({ "en.xlf": SOURCE_20 });
      const error = await adapter
        .write(resource([entry(key, "Value")], "en"), "en.xlf", { sourcePath: "en.xlf" })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AdapterError);
      expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
      expect((error as AdapterError).message).toContain(`"${key}"`);
    },
  );

  it("appends a key with any characters as a source-only XLIFF 1.2 unit", async () => {
    const { values } = await writeSource([entry("m#0 x", "Value")]);
    expect(values["m#0 x"]).toBe("Value");
  });
});
