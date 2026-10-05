import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GlossaryDefinition, VerbatraConfig } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  makeContext,
  makeTempDir,
  nodeFs,
  writeJsonFile,
} from "../test-support.js";
import { glossaryGetTool, glossaryWriteTool } from "./glossary.js";

const V2: GlossaryDefinition = {
  version: 2,
  terms: [
    {
      source: "Dashboard",
      target: "Dashboard",
      targets: { de: "Übersicht" },
      forbidden: { de: ["Instrumententafel"] },
      note: "The start page",
    },
    { source: "Save", target: "Speichern", caseSensitive: true },
  ],
  doNotTranslate: ["verbatra"],
};

const CONFIG: Partial<VerbatraConfig> = { targetLocales: ["de", "fr"] };

function inline(glossary: VerbatraConfig["glossary"]) {
  return makeContext({
    config: baseLoadedConfig({
      config: baseVerbatraConfig({ ...CONFIG, ...(glossary !== undefined ? { glossary } : {}) }),
      glossary: { source: "inline" },
    }),
  });
}

async function fileContext(content: unknown) {
  const dir = await makeTempDir();
  const path = join(dir, "glossary.json");
  await writeJsonFile(path, content);
  const context = makeContext({
    config: baseLoadedConfig({
      config: baseVerbatraConfig(CONFIG),
      glossary: { source: "file", path },
    }),
    cwd: dir,
    fs: nodeFs,
  });
  return { context, path };
}

async function onDisk(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

describe("glossary.get", () => {
  it("returns every term with its per-locale data and the terms kept untranslated", async () => {
    const outcome = await glossaryGetTool.execute({}, inline(V2));

    expect(outcome).toEqual({
      kind: "ok",
      result: {
        indicator: { source: "inline" },
        version: 2,
        terms: [
          {
            source: "Dashboard",
            target: "Dashboard",
            targets: { de: "Übersicht" },
            forbidden: { de: ["Instrumententafel"] },
            caseSensitive: false,
            note: "The start page",
          },
          {
            source: "Save",
            target: "Speichern",
            targets: {},
            forbidden: {},
            caseSensitive: true,
          },
        ],
        doNotTranslate: [{ term: "verbatra", caseSensitive: true }],
        redactedTerms: [],
      },
    });
  });

  it("reports a version 1 glossary as version 1 terms with a translation for every locale", async () => {
    const { context } = await fileContext({ API: "API" });

    const outcome = await glossaryGetTool.execute({}, context);

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        indicator: { source: "file", path: "glossary.json" },
        version: 1,
        terms: [{ source: "API", target: "API", targets: {}, forbidden: {} }],
      },
    });
  });

  it("reports no glossary as an empty one with no version", async () => {
    const outcome = await glossaryGetTool.execute(
      {},
      makeContext({ config: baseLoadedConfig({ glossary: { source: "none" } }) }),
    );

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { indicator: { source: "none" }, version: null, terms: [], doNotTranslate: [] },
    });
  });

  it("adds the terms a locale is held to when asked for one", async () => {
    const outcome = await glossaryGetTool.execute({ locale: "fr" }, inline(V2));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        effective: {
          locale: "fr",
          terms: [
            {
              source: "Dashboard",
              target: "Dashboard",
              forbidden: [],
              caseSensitive: false,
              note: "The start page",
            },
            { source: "Save", target: "Speichern", forbidden: [], caseSensitive: true },
          ],
          doNotTranslate: [{ term: "verbatra", caseSensitive: true }],
        },
      },
    });
  });

  it("gives the effective German terms their own translation and forbidden rendering", async () => {
    const outcome = await glossaryGetTool.execute({ locale: "de" }, inline(V2));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        effective: {
          terms: [
            { source: "Dashboard", target: "Übersicht", forbidden: ["Instrumententafel"] },
            { source: "Save", target: "Speichern" },
          ],
        },
      },
    });
  });

  it("gives an empty effective glossary for a locale nothing applies to", async () => {
    const outcome = await glossaryGetTool.execute({ locale: "de" }, inline(undefined));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { version: null, effective: { locale: "de", terms: [], doNotTranslate: [] } },
    });
  });

  it("refuses a locale that is not a configured target locale", async () => {
    const outcome = await glossaryGetTool.execute({ locale: "it" }, inline(V2));

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining(
        "UNKNOWN_LOCALE: Requested locale not in the configured target locales: it. Configured targets: de, fr.",
      ),
    });
  });

  it.each(["__proto__", "constructor", "prototype"])(
    "keeps a version 1 term named %s",
    async (name) => {
      const dir = await makeTempDir();
      const path = join(dir, "glossary.json");
      await writeFile(path, `{"${name}":"Wert","Save":"Speichern"}`, "utf8");
      const context = makeContext({
        config: baseLoadedConfig({ glossary: { source: "file", path } }),
        cwd: dir,
        fs: nodeFs,
      });

      const outcome = await glossaryGetTool.execute({}, context);

      expect(outcome).toMatchObject({
        kind: "ok",
        result: {
          terms: [
            { source: name, target: "Wert" },
            { source: "Save", target: "Speichern" },
          ],
        },
      });
    },
  );

  it("redacts every secret-shaped value and names the terms that had one", async () => {
    const secret = "sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z";
    const outcome = await glossaryGetTool.execute(
      { locale: "de" },
      inline({
        version: 2,
        terms: [{ source: "Leaked", targets: { de: secret }, note: secret }],
      }),
    );

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        terms: [{ source: "Leaked", targets: { de: "[REDACTED]" }, note: "[REDACTED]" }],
        redactedTerms: ["Leaked"],
        effective: { terms: [{ target: "[REDACTED]", note: "[REDACTED]" }] },
      },
    });
    expect(JSON.stringify(outcome)).not.toContain(secret);
  });

  it("rejects an unrecognized parameter", async () => {
    const outcome = await glossaryGetTool.execute({ bogus: true }, makeContext());

    expect(outcome.kind).toBe("invalid");
  });
});

describe("glossary.write", () => {
  it("adds a term to a version 1 file and keeps the file version 1", async () => {
    const { context, path } = await fileContext({});

    const outcome = await glossaryWriteTool.execute({ term: "API", translation: "API" }, context);

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { version: 1, terms: [{ source: "API", target: "API" }] },
    });
    expect(await onDisk(path)).toEqual({ API: "API" });
  });

  it("sets one locale's translation and forbidden renderings", async () => {
    const { context, path } = await fileContext(V2);

    const outcome = await glossaryWriteTool.execute(
      {
        term: "Save",
        locale: "fr",
        translation: "Enregistrer",
        forbidden: ["Sauver"],
        note: "Button label",
        partOfSpeech: "verb",
      },
      context,
    );

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        effective: {
          locale: "fr",
          terms: expect.arrayContaining([
            expect.objectContaining({
              source: "Save",
              target: "Enregistrer",
              forbidden: ["Sauver"],
            }),
          ]),
        },
      },
    });
    expect(await onDisk(path)).toMatchObject({
      terms: [
        {},
        {
          source: "Save",
          targets: { fr: "Enregistrer" },
          forbidden: { fr: ["Sauver"] },
          note: "Button label",
          partOfSpeech: "verb",
        },
      ],
    });
  });

  it("keeps a term untranslated and stops keeping it", async () => {
    const { context, path } = await fileContext(V2);

    await glossaryWriteTool.execute(
      { term: "Acme", doNotTranslate: true, caseSensitive: false },
      context,
    );
    expect(await onDisk(path)).toMatchObject({
      doNotTranslate: ["verbatra", { term: "Acme", caseSensitive: false }],
    });

    const outcome = await glossaryWriteTool.execute(
      { term: "Acme", doNotTranslate: false },
      context,
    );
    expect(outcome).toMatchObject({
      kind: "ok",
      result: { doNotTranslate: [{ term: "verbatra", caseSensitive: true }] },
    });
  });

  it("clears only the shared translation for null and keeps a term that still has others", async () => {
    const { context, path } = await fileContext(V2);

    await glossaryWriteTool.execute({ term: "Dashboard", translation: null }, context);

    expect((await onDisk(path)) as GlossaryDefinition).toMatchObject({
      terms: [{ source: "Dashboard", targets: { de: "Übersicht" } }, { source: "Save" }],
    });
  });

  it("removes a term whose shared translation was all it had", async () => {
    const { context } = await fileContext({ API: "API" });

    const outcome = await glossaryWriteTool.execute({ term: "API", translation: null }, context);

    expect(outcome).toMatchObject({ kind: "ok", result: { terms: [] } });
  });

  it("refuses a locale that is not a configured target locale and writes nothing", async () => {
    const { context, path } = await fileContext(V2);

    const outcome = await glossaryWriteTool.execute(
      { term: "Save", locale: "it", translation: "Salva" },
      context,
    );

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining(
        "UNKNOWN_LOCALE: Requested locale not in the configured target locales: it. Configured targets: de, fr.",
      ),
    });
    expect(await onDisk(path)).toEqual(V2);
  });

  it("reports an edit the SDK refuses as CONFIG_INVALID", async () => {
    const { context } = await fileContext(V2);

    const outcome = await glossaryWriteTool.execute(
      { term: "Dashboard", doNotTranslate: true, translation: "x" },
      context,
    );

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("CONFIG_INVALID"),
    });
  });

  it("tells the agent to create a glossary file when none is configured", async () => {
    const context = makeContext({
      config: baseLoadedConfig({ glossary: { source: "none" } }),
    });

    const outcome = await glossaryWriteTool.execute({ term: "API", translation: "API" }, context);

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("GLOSSARY_NOT_FILE_BACKED"),
    });
    const message = outcome.kind === "error" ? outcome.message : "";
    expect(message).toContain("Next step: Create a glossary file, such as glossary.json");
    expect(message).not.toContain("Move the glossary");
  });

  it("tells the agent to move an inline glossary into its own file", async () => {
    const context = makeContext({
      config: baseLoadedConfig({ glossary: { source: "inline" } }),
    });

    const outcome = await glossaryWriteTool.execute({ term: "API", translation: "API" }, context);

    const message = outcome.kind === "error" ? outcome.message : "";
    expect(message).toContain("GLOSSARY_NOT_FILE_BACKED");
    expect(message).toContain("Next step: Move the glossary into its own file");
  });

  it.each([
    ["a blank term", { term: "", translation: "x" }],
    ["an unknown field", { term: "A", translation: "x", target: "y" }],
    ["too many forbidden renderings", { term: "A", locale: "de", forbidden: Array(51).fill("x") }],
  ])("rejects %s", async (_label, params) => {
    const outcome = await glossaryWriteTool.execute(params, makeContext());

    expect(outcome.kind).toBe("invalid");
  });

  it("is annotated as destructive, since it can clear translations and remove terms", () => {
    expect(glossaryWriteTool.annotations.destructiveHint).toBe(true);
  });
});
