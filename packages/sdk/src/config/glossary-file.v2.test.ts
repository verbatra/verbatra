import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultFs, type SdkFs } from "../fs.js";
import { makeTempDir, readTextFile } from "../test-support.js";
import {
  readGlossaryFile,
  type UpdateGlossaryTermInput,
  updateGlossaryTerm,
} from "./glossary-file.js";
import { loadConfigWithMeta } from "./load-config.js";
import type { GlossaryProvenance } from "./resolve-glossary.js";

async function seed(content: unknown): Promise<{ cwd: string; path: string }> {
  const cwd = await makeTempDir();
  const path = join(cwd, "glossary.json");
  await writeFile(
    path,
    typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`,
    "utf8",
  );
  return { cwd, path };
}

function file(path: string): GlossaryProvenance {
  return { source: "file", path };
}

async function edit(
  seeded: { cwd: string; path: string },
  change: Omit<UpdateGlossaryTermInput, "glossary" | "cwd">,
) {
  return updateGlossaryTerm({ glossary: file(seeded.path), cwd: seeded.cwd, ...change });
}

async function onDisk(path: string): Promise<unknown> {
  return JSON.parse(await readTextFile(path));
}

const V2 = {
  version: 2,
  terms: [
    {
      source: "Dashboard",
      targets: { de: "Übersicht", fr: "Tableau de bord" },
      forbidden: { de: ["Instrumententafel"] },
    },
  ],
  doNotTranslate: ["verbatra"],
};

describe("readGlossaryFile: versions", () => {
  it("reads a version 2 file with its per-locale translations and kept terms", async () => {
    const { path } = await seed(V2);
    const glossary = await readGlossaryFile({ glossary: file(path) });
    expect(glossary.version).toBe(2);
    expect(glossary.terms[0]?.targets).toEqual({ de: "Übersicht", fr: "Tableau de bord" });
    expect(glossary.doNotTranslate).toEqual([{ term: "verbatra", caseSensitive: true }]);
  });

  it("reads a version 1 file as version 1", async () => {
    const { path } = await seed({ Save: "Speichern" });
    expect((await readGlossaryFile({ glossary: file(path) })).version).toBe(1);
  });

  it("keeps a version 1 term named __proto__", async () => {
    const { path } = await seed('{\n  "__proto__": "Prototyp",\n  "Save": "Speichern"\n}\n');
    const glossary = await readGlossaryFile({ glossary: file(path) });
    expect(glossary.terms.map((term) => term.source)).toEqual(["__proto__", "Save"]);
  });

  it("refuses an unsupported version and names the supported ones", async () => {
    const { path } = await seed({ version: 3, terms: [] });
    await expect(readGlossaryFile({ glossary: file(path) })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      message: expect.stringContaining("declares version 3"),
    });
  });

  it("tells a file declaring version 1 that a version 1 glossary declares no version", async () => {
    const { path } = await seed({ version: 1, Save: "Speichern" });
    const failure = readGlossaryFile({ glossary: file(path) });
    await expect(failure).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      message: `The glossary file at ${path} declares "version": 1, but a version 1 glossary is a flat term map with no "version" field. Remove the "version" field, or write a version 2 glossary with "version": 2.`,
    });
  });

  it("names the field an invalid version 2 file gets wrong", async () => {
    const { path } = await seed({ version: 2, terms: [{ source: "A", target: "" }] });
    await expect(readGlossaryFile({ glossary: file(path) })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      message: expect.stringContaining("terms.0.target: must not be blank"),
    });
  });

  it.each([
    ["an array", []],
    ["a string", "glossary"],
    ["a nested object", { a: { b: "c" } }],
  ])("refuses %s with a message naming both accepted shapes", async (_label, content) => {
    const { path } = await seed(JSON.stringify(content));
    await expect(readGlossaryFile({ glossary: file(path) })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      message: expect.stringContaining('or a version 2 glossary with "version": 2'),
    });
  });
});

describe("updateGlossaryTerm: version 1 files", () => {
  it("keeps a version 1 file version 1 for a translation every locale shares", async () => {
    const seeded = await seed({ Save: "Speichern" });
    const glossary = await edit(seeded, { term: "Open", translation: "Öffnen" });
    expect(glossary.version).toBe(1);
    expect(await onDisk(seeded.path)).toEqual({ Save: "Speichern", Open: "Öffnen" });
  });

  it("keeps a __proto__ term on disk when another term is edited", async () => {
    const seeded = await seed('{\n  "__proto__": "Prototyp"\n}\n');
    await edit(seeded, { term: "Save", translation: "Speichern" });
    expect(Object.keys((await onDisk(seeded.path)) as object)).toEqual(["__proto__", "Save"]);
  });

  it("upgrades to version 2 on a per-locale edit, keeping every term as a shared translation", async () => {
    const seeded = await seed({ Save: "Speichern", Open: "Öffnen" });
    const glossary = await edit(seeded, { term: "Save", locale: "fr", translation: "Enregistrer" });
    expect(glossary.version).toBe(2);
    expect(await onDisk(seeded.path)).toEqual({
      version: 2,
      terms: [
        { source: "Save", target: "Speichern", targets: { fr: "Enregistrer" } },
        { source: "Open", target: "Öffnen" },
      ],
    });
  });

  it("upgrades to version 2 to keep a term untranslated", async () => {
    const seeded = await seed({ Save: "Speichern" });
    await edit(seeded, { term: "verbatra", doNotTranslate: true });
    expect(await onDisk(seeded.path)).toEqual({
      version: 2,
      terms: [{ source: "Save", target: "Speichern" }],
      doNotTranslate: ["verbatra"],
    });
  });

  it("refuses an upgrade that would carry an empty version 1 translation", async () => {
    const seeded = await seed({ Save: "" });
    await expect(edit(seeded, { term: "Save", note: "Button label" })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      message: expect.stringContaining("terms.0.target: must not be blank"),
    });
  });
});

describe("updateGlossaryTerm: version 2 files", () => {
  it("keeps the key order the file was written in, not the schema's", async () => {
    const seeded = await seed(
      '{\n  "terms": [\n    {\n      "targets": { "fr": "Tableau de bord" },\n      "note": "Start page",\n      "source": "Dashboard"\n    }\n  ],\n  "doNotTranslate": ["verbatra"],\n  "version": 2\n}\n',
    );
    await edit(seeded, { term: "Dashboard", locale: "de", translation: "Übersicht" });
    const written = (await onDisk(seeded.path)) as Record<string, unknown>;
    expect(Object.keys(written)).toEqual(["terms", "doNotTranslate", "version"]);
    const term = (written.terms as Record<string, unknown>[])[0] ?? {};
    expect(Object.keys(term)).toEqual(["targets", "note", "source"]);
    expect(Object.keys(term.targets as object)).toEqual(["fr", "de"]);
  });

  it("refuses a file whose per-locale translations use __proto__ as a locale", async () => {
    const { path } = await seed(
      '{ "version": 2, "terms": [{ "source": "A", "targets": { "__proto__": "B" } }] }',
    );
    await expect(readGlossaryFile({ glossary: file(path) })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      message: expect.stringContaining('names "__proto__", which is not a locale code'),
    });
  });

  it("sets one locale's translation without touching the others", async () => {
    const seeded = await seed(V2);
    await edit(seeded, { term: "Dashboard", locale: "de", translation: "Startseite" });
    expect(await onDisk(seeded.path)).toMatchObject({
      terms: [{ targets: { fr: "Tableau de bord", de: "Startseite" } }],
    });
  });

  it("replaces a locale entry written in another case instead of adding a second one", async () => {
    const seeded = await seed(V2);
    await edit(seeded, { term: "Dashboard", locale: "DE", translation: "Startseite" });
    const terms = ((await onDisk(seeded.path)) as typeof V2).terms;
    expect(Object.entries(terms[0]?.targets ?? {})).toEqual([
      ["DE", "Startseite"],
      ["fr", "Tableau de bord"],
    ]);
  });

  it("keeps the file's key order when a do-not-translate term is added or the last one removed", async () => {
    const seeded = await seed('{"doNotTranslate":["verbatra"],"terms":[],"version":2}');
    await edit(seeded, { term: "Acme", doNotTranslate: true });
    expect(Object.keys((await onDisk(seeded.path)) as object)).toEqual([
      "doNotTranslate",
      "terms",
      "version",
    ]);
    await edit(seeded, { term: "Acme", doNotTranslate: false });
    await edit(seeded, { term: "verbatra", doNotTranslate: false });
    expect(Object.keys((await onDisk(seeded.path)) as object)).toEqual(["terms", "version"]);
  });

  it("replaces and clears a locale's forbidden renderings", async () => {
    const seeded = await seed(V2);
    await edit(seeded, { term: "Dashboard", locale: "de", forbidden: ["Armaturenbrett", "Tafel"] });
    expect(await onDisk(seeded.path)).toMatchObject({
      terms: [{ forbidden: { de: ["Armaturenbrett", "Tafel"] } }],
    });
    await edit(seeded, { term: "Dashboard", locale: "de", forbidden: null });
    expect(((await onDisk(seeded.path)) as typeof V2).terms[0]).not.toHaveProperty("forbidden");
  });

  it("clears forbidden renderings given as an empty list", async () => {
    const seeded = await seed(V2);
    await edit(seeded, { term: "Dashboard", locale: "de", forbidden: [] });
    expect(((await onDisk(seeded.path)) as typeof V2).terms[0]).not.toHaveProperty("forbidden");
  });

  it("sets and removes a note, a part of speech and case sensitivity", async () => {
    const seeded = await seed(V2);
    await edit(seeded, {
      term: "Dashboard",
      note: "Start page",
      partOfSpeech: "noun",
      caseSensitive: true,
    });
    expect(await onDisk(seeded.path)).toMatchObject({
      terms: [{ note: "Start page", partOfSpeech: "noun", caseSensitive: true }],
    });
    await edit(seeded, { term: "Dashboard", note: null, partOfSpeech: null, caseSensitive: false });
    const term = ((await onDisk(seeded.path)) as typeof V2).terms[0];
    expect(term).not.toHaveProperty("note");
    expect(term).not.toHaveProperty("partOfSpeech");
    expect(term).not.toHaveProperty("caseSensitive");
  });

  it("sets and removes the translation every locale shares", async () => {
    const seeded = await seed(V2);
    await edit(seeded, { term: "Dashboard", translation: "Dashboard" });
    expect(await onDisk(seeded.path)).toMatchObject({ terms: [{ target: "Dashboard" }] });
  });

  it("removes a term whose last translation and forbidden rendering are cleared", async () => {
    const seeded = await seed({ version: 2, terms: [{ source: "A", targets: { de: "B" } }] });
    const glossary = await edit(seeded, { term: "A", locale: "de", translation: null });
    expect(glossary.terms).toEqual([]);
  });

  it("clears only the shared translation for null and keeps the term's other data", async () => {
    const seeded = await seed({
      version: 2,
      terms: [{ source: "A", target: "B", targets: { de: "C" } }],
    });
    const glossary = await edit(seeded, { term: "A", translation: null });
    expect(glossary.terms).toEqual([
      { source: "A", targets: { de: "C" }, forbidden: {}, caseSensitive: false },
    ]);
  });

  it("removes the term for a shared translation of null once nothing else is left", async () => {
    const seeded = await seed({
      version: 2,
      terms: [{ source: "A", target: "B" }],
      doNotTranslate: ["x"],
    });
    await edit(seeded, { term: "A", translation: null });
    expect(await onDisk(seeded.path)).toEqual({ version: 2, terms: [], doNotTranslate: ["x"] });
  });

  it("adds a term that only lists forbidden renderings", async () => {
    const seeded = await seed(V2);
    const glossary = await edit(seeded, { term: "Board", locale: "de", forbidden: ["Brett"] });
    expect(glossary.terms[1]).toMatchObject({ source: "Board", forbidden: { de: ["Brett"] } });
  });

  it("refuses to add a term with only a note", async () => {
    const seeded = await seed(V2);
    await expect(edit(seeded, { term: "Board", note: "context" })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      message: expect.stringContaining("needs a translation or a forbidden rendering"),
    });
  });

  it("adds, updates and removes a do-not-translate term", async () => {
    const seeded = await seed(V2);
    await edit(seeded, { term: "Acme", doNotTranslate: true, caseSensitive: false });
    expect(await onDisk(seeded.path)).toMatchObject({
      doNotTranslate: ["verbatra", { term: "Acme", caseSensitive: false }],
    });
    await edit(seeded, { term: "Acme", doNotTranslate: true });
    expect(await onDisk(seeded.path)).toMatchObject({ doNotTranslate: ["verbatra", "Acme"] });
    await edit(seeded, { term: "verbatra", doNotTranslate: false });
    await edit(seeded, { term: "Acme", doNotTranslate: false });
    expect(await onDisk(seeded.path)).not.toHaveProperty("doNotTranslate");
  });

  it("refuses to keep a glossary term untranslated", async () => {
    const seeded = await seed(V2);
    await expect(edit(seeded, { term: "Dashboard", doNotTranslate: true })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      message: expect.stringContaining("it is also a glossary term"),
    });
  });

  it("writes a file the config loader reads back unchanged", async () => {
    const seeded = await seed(V2);
    await edit(seeded, { term: "Dashboard", locale: "es", translation: "Panel" });
    const loaded = await loadConfigWithMeta({
      configOverride: {
        sourceLocale: "en",
        targetLocales: ["de"],
        format: "i18next-json",
        files: { pattern: "locales/{locale}.json" },
        provider: { id: "deepl", options: {} },
        glossary: "glossary.json",
      },
      cwd: seeded.cwd,
    });
    expect(loaded.config.glossary).toEqual(await onDisk(seeded.path));
  });
});

describe("updateGlossaryTerm: edits that change nothing", () => {
  it.each<[string, unknown, Omit<UpdateGlossaryTermInput, "glossary" | "cwd">]>([
    [
      "removing an absent version 1 term",
      '{"Save":"Speichern"}',
      { term: "Open", translation: null },
    ],
    [
      "repeating a version 1 translation",
      '{"Save":"Speichern"}',
      { term: "Save", translation: "Speichern" },
    ],
    [
      "clearing the shared translation of an absent version 2 term",
      '{"version":2,"terms":[{"source":"A","target":"B"}]}',
      { term: "Absent", translation: null },
    ],
    [
      "clearing every field of an absent version 2 term",
      '{"version":2,"terms":[{"source":"A","target":"B"}]}',
      {
        term: "Absent",
        locale: "de",
        translation: null,
        forbidden: [],
        note: null,
        partOfSpeech: null,
        caseSensitive: false,
      },
    ],
    [
      "repeating the translation of a locale that is not the last one",
      '{"version":2,"terms":[{"source":"A","targets":{"de":"B","fr":"C"}}]}',
      { term: "A", locale: "de", translation: "B" },
    ],
    [
      "repeating a version 2 translation",
      '{"version":2,"terms":[{"source":"A","targets":{"de":"B"}}]}',
      { term: "A", locale: "de", translation: "B" },
    ],
  ])("leaves the file untouched when %s", async (_label, content, change) => {
    const seeded = await seed(content);
    const writes: string[] = [];
    const fs: SdkFs = {
      ...defaultFs,
      writeFile: async (path, data) => {
        writes.push(path);
        await defaultFs.writeFile(path, data);
      },
    };
    await updateGlossaryTerm({ glossary: file(seeded.path), cwd: seeded.cwd, ...change }, { fs });
    expect(writes.filter((path) => path === seeded.path)).toEqual([]);
    expect(await readTextFile(seeded.path)).toBe(content);
  });
});

describe("updateGlossaryTerm: edits that are refused before the file is read", () => {
  it.each<[string, Omit<UpdateGlossaryTermInput, "glossary" | "cwd">, string]>([
    ["an edit that sets no field", { term: "A" }, "sets no field"],
    [
      "doNotTranslate with a translation",
      { term: "A", doNotTranslate: true, translation: "B" },
      "Keep a term untranslated in its own edit",
    ],
    [
      "forbidden renderings without a locale",
      { term: "A", forbidden: ["B"] },
      "belong to one locale",
    ],
    [
      "an invalid locale",
      { term: "A", locale: "german", translation: "B" },
      "is not a valid BCP 47 locale code",
    ],
    [
      "a blank forbidden rendering",
      { term: "A", locale: "de", forbidden: [" "] },
      "must not be blank",
    ],
    ["a blank note", { term: "A", note: " " }, "must not be blank"],
    ["a blank part of speech", { term: "A", partOfSpeech: "" }, "must not be blank"],
  ])("refuses %s", async (_label, change, message) => {
    const seeded = await seed(V2);
    const before = await readTextFile(seeded.path);
    await expect(edit(seeded, change)).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      message: expect.stringContaining(message),
    });
    expect(await readTextFile(seeded.path)).toBe(before);
  });
});
