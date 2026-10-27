import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { baseConfig, makeTempDir } from "../test-support.js";
import type { GlossaryInput } from "./glossary.js";
import {
  editConfiguredGlossaryTerm,
  type GlossaryConfig,
  type ReadCurrentGlossaryInput,
  readCurrentGlossary,
} from "./glossary-file.js";

function inline(glossary?: GlossaryInput): GlossaryConfig {
  return {
    config: baseConfig({
      targetLocales: ["de", "fr"],
      ...(glossary !== undefined ? { glossary } : {}),
    }),
    glossary: glossary === undefined ? { source: "none" } : { source: "inline" },
  };
}

async function fileBacked(content: string): Promise<{ loaded: GlossaryConfig; path: string }> {
  const dir = await makeTempDir();
  const path = join(dir, "glossary.json");
  await writeFile(path, content, "utf8");
  return {
    loaded: {
      config: baseConfig({ targetLocales: ["de", "fr"] }),
      glossary: { source: "file", path },
    },
    path,
  };
}

describe("readCurrentGlossary", () => {
  it("returns nothing for a config without a glossary", async () => {
    expect(await readCurrentGlossary({ loaded: inline() })).toBeUndefined();
  });

  it("normalizes an inline glossary", async () => {
    const glossary = await readCurrentGlossary({ loaded: inline({ Save: "Speichern" }) });
    expect(glossary?.terms.map((term) => term.target)).toEqual(["Speichern"]);
  });

  it("reads a file-backed glossary as it is on disk now", async () => {
    const { loaded, path } = await fileBacked('{"Save":"Speichern"}');
    await writeFile(path, '{"Save":"Sichern"}', "utf8");
    expect((await readCurrentGlossary({ loaded }))?.terms[0]?.target).toBe("Sichern");
  });

  it("takes only the loaded config, leaving the locale view to glossaryForLocale", () => {
    expectTypeOf<keyof ReadCurrentGlossaryInput>().toEqualTypeOf<"loaded">();
  });
});

describe("editConfiguredGlossaryTerm", () => {
  it("writes a locale edit and ignores fields left undefined", async () => {
    const { loaded, path } = await fileBacked('{"Save":"Speichern"}');

    const glossary = await editConfiguredGlossaryTerm({
      loaded,
      cwd: join(path, ".."),
      term: "Save",
      locale: "fr",
      translation: "Enregistrer",
      note: undefined,
      forbidden: undefined,
    });

    expect(glossary.terms[0]?.targets).toEqual({ fr: "Enregistrer" });
  });

  it("refuses a locale that is not configured and writes nothing", async () => {
    const { loaded, path } = await fileBacked('{"Save":"Speichern"}');

    await expect(
      editConfiguredGlossaryTerm({ loaded, term: "Save", locale: "it", translation: "Salva" }),
    ).rejects.toMatchObject({
      code: "UNKNOWN_LOCALE",
      message: expect.stringContaining("Configured targets: de, fr."),
    });
    expect(await readFile(path, "utf8")).toBe('{"Save":"Speichern"}');
  });
});
