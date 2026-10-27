import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { createMemoryAdapterFs } from "../test-support.js";
import { isSameLanguage, readsTargets } from "./languages.js";
import { createXliffAdapter } from "./xliff-adapter.js";

function xliff12(fileAttributes: string, units: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2"><file ${fileAttributes} datatype="plaintext"><body>${units}</body></file></xliff>`;
}

function xliff20(rootAttributes: string, segments: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" ${rootAttributes}><file id="f"><unit id="k"><segment${segments}</segment></unit></file></xliff>`;
}

async function readValues(content: string, locale: string): Promise<Record<string, string>> {
  const fs = createMemoryAdapterFs({ "m.xlf": content });
  const { resource } = await createXliffAdapter(fs).read("m.xlf", locale);
  return Object.fromEntries([...resource.entries].map(([key, entry]) => [key, entry.value]));
}

describe("isSameLanguage", () => {
  it.each([
    ["en", "en", true],
    ["EN", "en", true],
    ["en_US", "en-us", true],
    ["en", "en-US", true],
    ["en-US", "en", true],
    ["en-US", "en-GB", false],
    ["en", "de", false],
    ["zh-Hant", "zh-Hans", false],
  ])("compares %s with %s as %s", (declared, locale, same) => {
    expect(isSameLanguage(declared, locale)).toBe(same);
  });
});

describe("readsTargets", () => {
  it.each([
    [{ source: "en", target: "de" }, "de", false, true],
    [{ source: "en", target: "de" }, "en", true, false],
    [{ source: null, target: "de" }, "en", false, true],
    [{ source: "en", target: "en" }, "en", false, true],
    [{ source: "en", target: null }, "en", true, false],
    [{ source: "en-US", target: null }, "en", false, false],
    [{ source: "en", target: null }, "de", false, true],
    [{ source: null, target: null }, "de", true, true],
    [{ source: null, target: null }, "en", false, false],
  ])("decides %j read as %s (targets present: %s) -> %s", (languages, locale, has, expected) => {
    expect(readsTargets(languages, locale, has)).toBe(expected);
  });
});

describe("xliff read: a missing translation is missing, never the source", () => {
  it.each([
    ["an empty target", "<target></target>"],
    ["a self-closed target", "<target/>"],
    ["a whitespace-only target", "<target>  </target>"],
    ["no target element", ""],
    ["a target in state new", '<target state="new">Hello</target>'],
    ["a target in state needs-translation", '<target state="needs-translation">Hello</target>'],
  ])("leaves out a unit with %s", async (_label, target) => {
    const doc = xliff12(
      'source-language="en" target-language="de"',
      `<trans-unit id="k"><source>Hello</source>${target}</trans-unit><trans-unit id="done"><source>Bye</source><target>Tschuess</target></trans-unit>`,
    );
    expect(await readValues(doc, "de")).toEqual({ done: "Tschuess" });
  });

  it.each([
    "translated",
    "needs-review-translation",
    "needs-adaptation",
    "needs-l10n",
    "signed-off",
    "final",
  ])("reads a non-empty target in state %s as translated", async (state) => {
    const doc = xliff12(
      'source-language="en" target-language="de"',
      `<trans-unit id="k"><source>Hello</source><target state="${state}">Hallo</target></trans-unit>`,
    );
    expect(await readValues(doc, "de")).toEqual({ k: "Hallo" });
  });

  it.each([
    ["an explicit initial state and a target copied from the source", ' state="initial"', "Hi", {}],
    [
      "an explicit initial state and a target that differs",
      ' state="initial"',
      "Hallo",
      { k: "Hallo" },
    ],
    ["no state and a target copied from the source", "", "Hi", { k: "Hi" }],
    [
      "state translated and a target copied from the source",
      ' state="translated"',
      "Hi",
      { k: "Hi" },
    ],
    ["an explicit initial state and an empty target", ' state="initial"', "", {}],
  ])("reads an XLIFF 2.0 segment with %s", async (_label, state, target, expected) => {
    const doc = xliff20(
      'srcLang="en" trgLang="de"',
      `${state}><source>Hi</source><target>${target}</target>`,
    );
    expect(await readValues(doc, "de")).toEqual(expected);
  });

  it("reads an XLIFF 2.0 segment without a target as missing", async () => {
    expect(await readValues(xliff20('srcLang="en"', "><source>Hi</source>"), "de")).toEqual({});
  });

  it("reads a copy of the source document as holding no translation for another locale", async () => {
    const doc = xliff12(
      'source-language="en-US"',
      '<trans-unit id="k"><source>Hello</source></trans-unit>',
    );
    expect(await readValues(doc, "de")).toEqual({});
  });

  it("reads the sources of a document whose declared source language is the locale", async () => {
    const doc = xliff12(
      'source-language="en-US"',
      '<trans-unit id="k"><source>Hello</source></trans-unit>',
    );
    expect(await readValues(doc, "en")).toEqual({ k: "Hello" });
    expect(await readValues(xliff20('srcLang="en"', "><source>Hi</source>"), "en")).toEqual({
      k: "Hi",
    });
  });

  it("decides per <file> element in an XLIFF 1.2 document with several", async () => {
    const doc = `<xliff version="1.2">
<file source-language="en" target-language="de"><body><trans-unit id="a"><source>A</source></trans-unit><trans-unit id="b"><source>B</source><target>Bee</target></trans-unit></body></file>
<file source-language="de"><body><trans-unit id="c"><source>Cee</source></trans-unit></body></file>
</xliff>`;
    expect(await readValues(doc, "de")).toEqual({ b: "Bee", c: "Cee" });
  });

  it("still rejects a duplicate id when the first unit carries no translation", async () => {
    const doc = xliff12(
      'source-language="en" target-language="de"',
      '<trans-unit id="k"><source>A</source></trans-unit><trans-unit id="k"><source>B</source><target>Bee</target></trans-unit>',
    );
    const fs = createMemoryAdapterFs({ "m.xlf": doc });
    await expect(createXliffAdapter(fs).read("m.xlf", "de")).rejects.toMatchObject({
      code: "INVALID_STRUCTURE",
    });
  });
});

describe("xliff write: states and placement", () => {
  function resource(value: string): LocaleResource {
    const entry: TranslationEntry = {
      key: "k",
      namespace: "m",
      value,
      placeholders: [],
      isPlural: false,
    };
    return { locale: "de", namespace: "m", format: "xliff", entries: new Map([["k", entry]]) };
  }

  async function writeInto(doc: string, value: string): Promise<string> {
    const fs = createMemoryAdapterFs({ "m.xlf": doc });
    await createXliffAdapter(fs).write(resource(value), "m.xlf");
    return fs.files.get("m.xlf") ?? "";
  }

  it.each(["new", "needs-translation"])(
    "marks a target in state %s translated once a value is written into it",
    async (state) => {
      const doc = xliff12(
        'source-language="en" target-language="de"',
        `<trans-unit id="k"><source>Hello</source><target state="${state}">Hello</target></trans-unit>`,
      );
      const written = await writeInto(doc, "Hallo");
      expect(written).toContain('<target state="translated">Hallo</target>');
      expect(await readValues(written, "de")).toEqual({ k: "Hallo" });
    },
  );

  it("leaves any other target state as it was", async () => {
    const doc = xliff12(
      'source-language="en" target-language="de"',
      '<trans-unit id="k"><source>Hello</source><target state="needs-review-translation">Alt</target></trans-unit>',
    );
    expect(await writeInto(doc, "Hallo")).toContain(
      '<target state="needs-review-translation">Hallo</target>',
    );
  });

  it("creates a missing target after <seg-source> when the unit has one", async () => {
    const doc = xliff12(
      'source-language="en" target-language="de"',
      '<trans-unit id="k"><source>Hello</source><seg-source><mrk mtype="seg" mid="1">Hello</mrk></seg-source><note>n</note></trans-unit>',
    );
    expect(await writeInto(doc, "Hallo")).toContain(
      "</seg-source><target>Hallo</target><note>n</note>",
    );
  });

  it("creates a missing target in the document's namespace without a namespace reset", async () => {
    const doc = `<xliff xmlns="urn:oasis:names:tc:xliff:document:1.2" version="1.2"><file source-language="en" target-language="de"><body><trans-unit id="k"><source>Hello</source></trans-unit></body></file></xliff>`;
    const written = await writeInto(doc, "Hallo");
    expect(written).toContain("<source>Hello</source><target>Hallo</target>");
    expect(written).not.toContain('xmlns=""');
  });

  it("marks an XLIFF 2.0 segment in state initial translated and drops its subState", async () => {
    const doc = xliff20(
      'srcLang="en" trgLang="de"',
      ' state="initial" subState="x:new"><source>Hello</source><target>Hello</target>',
    );
    const written = await writeInto(doc, "Hallo");
    expect(written).toContain(
      '<segment state="translated"><source>Hello</source><target>Hallo</target>',
    );
    expect(await readValues(written, "de")).toEqual({ k: "Hallo" });
  });

  it.each([
    ["no state", "", "<segment><source>"],
    ["state reviewed", ' state="reviewed"', '<segment state="reviewed"><source>'],
  ])("leaves an XLIFF 2.0 segment with %s as it was", async (_label, state, expected) => {
    const doc = xliff20(
      'srcLang="en" trgLang="de"',
      `${state}><source>Hello</source><target>Alt</target>`,
    );
    expect(await writeInto(doc, "Hallo")).toContain(
      `${expected}Hello</source><target>Hallo</target>`,
    );
  });

  it("keeps an XLIFF 2.0 segment state when writing the source document itself", async () => {
    const doc = xliff20('srcLang="de"', ' state="initial"><source>Hallo</source>');
    const fs = createMemoryAdapterFs({ "m.xlf": doc });
    await createXliffAdapter(fs).write(resource("Hallo!"), "m.xlf", { sourcePath: "m.xlf" });
    expect(fs.files.get("m.xlf")).toContain('<segment state="initial"><source>Hallo!</source>');
  });
});
