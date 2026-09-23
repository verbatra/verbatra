import type { LoadedConfig, SdkFs } from "@verbatra/sdk";
import { describe, expect, it, vi } from "vitest";
import type { GlossaryGetResult } from "../../shared/rpc/glossary.js";
import type { RpcHandlerDeps } from "../rpc.js";
import { baseStudioConfig } from "../test-support.js";
import { glossaryGetHandler, glossaryWriteHandler } from "./glossary.js";

function deps(loaded: LoadedConfig, projectRoot = "/project", fs?: SdkFs): RpcHandlerDeps {
  return { config: loaded, projectRoot, ...(fs !== undefined ? { fs } : {}) };
}

function termMapOf(result: GlossaryGetResult): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(result.terms.map((term) => [term.source, term.target]));
}

function fileBacked(entries: Readonly<Record<string, string>>): LoadedConfig {
  return {
    config: baseStudioConfig({ glossary: entries }),
    source: { kind: "override" },
    glossary: { source: "file", path: "/project/glossary.json" },
  };
}

function fakeGlossaryFs(store: Map<string, string>): SdkFs {
  const locks = new Set<string>();
  return {
    fileExists: async (path: string): Promise<boolean> => store.has(path),
    readFileBounded: async (path: string) => {
      const content = store.get(path);
      return content === undefined
        ? ({ kind: "missing" } as const)
        : ({ kind: "ok", content } as const);
    },
    readBytesBounded: async () => ({ kind: "missing" }) as const,
    writeFile: async (path: string, data: string): Promise<void> => {
      store.set(path, data);
    },
    writeBytes: async (): Promise<void> => {},
    createExclusive: async (path: string): Promise<boolean> => {
      if (locks.has(path)) {
        return false;
      }
      locks.add(path);
      return true;
    },
    deleteFile: async (path: string): Promise<void> => {
      locks.delete(path);
    },
  };
}

describe("glossaryGetHandler", () => {
  it("reports source: none with no entries when the config has no glossary", async () => {
    const loaded: LoadedConfig = {
      config: baseStudioConfig(),
      source: { kind: "override" },
      glossary: { source: "none" },
    };

    const result = await glossaryGetHandler({}, deps(loaded));

    expect(result).toEqual({
      indicator: { source: "none" },
      version: null,
      locales: ["de"],
      terms: [],
      doNotTranslate: [],
      redactedTerms: [],
    });
  });

  it("reports source: inline with the inline entries", async () => {
    const loaded: LoadedConfig = {
      config: baseStudioConfig({ glossary: { hello: "hola" } }),
      source: { kind: "override" },
      glossary: { source: "inline" },
    };

    const result = await glossaryGetHandler({}, deps(loaded));

    expect(result.indicator).toEqual({ source: "inline" });
    expect(termMapOf(result)).toEqual({ hello: "hola" });
    expect(result.redactedTerms).toEqual([]);
  });

  it("reports source: file with the path relativized against the project root", async () => {
    const store = new Map([["/project/glossary.json", '{"hello":"hola"}']]);
    const result = await glossaryGetHandler(
      {},
      deps(fileBacked({ hello: "hola" }), "/project", fakeGlossaryFs(store)),
    );

    expect(result.indicator).toEqual({ source: "file", path: "glossary.json" });
    expect(termMapOf(result)).toEqual({ hello: "hola" });
  });

  it("reads a file-backed glossary fresh from disk rather than from the config loaded at startup", async () => {
    const store = new Map([["/project/glossary.json", '{"hello":"hola","cli":"CLI"}']]);

    const result = await glossaryGetHandler(
      {},
      deps(fileBacked({ hello: "stale" }), "/project", fakeGlossaryFs(store)),
    );

    expect(termMapOf(result)).toEqual({ hello: "hola", cli: "CLI" });
  });

  it("redacts a secret-shaped glossary value before it leaves the handler and names the term", async () => {
    const loaded: LoadedConfig = {
      config: baseStudioConfig({ glossary: { apiTerm: "sk-abcdEFGH12345678", hello: "hola" } }),
      source: { kind: "override" },
      glossary: { source: "inline" },
    };

    const result = await glossaryGetHandler({}, deps(loaded));

    expect(termMapOf(result).apiTerm).toBe("[REDACTED]");
    expect(result.redactedTerms).toEqual(["apiTerm"]);
  });

  it("exposes only the glossary view, never the raw config", async () => {
    const loaded: LoadedConfig = {
      config: baseStudioConfig({ glossary: { hello: "hola" } }),
      source: { kind: "override" },
      glossary: { source: "inline" },
    };

    const result = await glossaryGetHandler({}, deps(loaded));

    expect(Object.keys(result)).toEqual([
      "indicator",
      "version",
      "locales",
      "terms",
      "doNotTranslate",
      "redactedTerms",
    ]);
    expect(JSON.stringify(result)).not.toContain("test-model");
    expect(JSON.stringify(result)).not.toContain("maxTokens");
  });
});

describe("glossaryWriteHandler", () => {
  it("adds a term to the file the loaded config names and returns the new state", async () => {
    const store = new Map([["/project/glossary.json", '{\n  "hello": "hola"\n}\n']]);

    const result = await glossaryWriteHandler(
      { term: "cli", translation: "CLI" },
      deps(fileBacked({ hello: "hola" }), "/project", fakeGlossaryFs(store)),
    );

    expect(termMapOf(result)).toEqual({ hello: "hola", cli: "CLI" });
    expect(store.get("/project/glossary.json")).toBe('{\n  "hello": "hola",\n  "cli": "CLI"\n}\n');
  });

  it("removes a term when the translation is null", async () => {
    const store = new Map([["/project/glossary.json", '{"hello":"hola","cli":"CLI"}']]);

    const result = await glossaryWriteHandler(
      { term: "cli", translation: null },
      deps(fileBacked({ hello: "hola", cli: "CLI" }), "/project", fakeGlossaryFs(store)),
    );

    expect(termMapOf(result)).toEqual({ hello: "hola" });
  });

  it("writes to the path the loaded config resolved, never to one a caller could name", async () => {
    const store = new Map([["/project/glossary.json", '{"hello":"hola"}']]);
    const fs = fakeGlossaryFs(store);
    const writeFile = vi.spyOn(fs, "writeFile");

    await glossaryWriteHandler(
      { term: "cli", translation: "CLI" },
      deps(fileBacked({ hello: "hola" }), "/project", fs),
    );

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0]?.[0]).toBe("/project/glossary.json");
  });

  it("refuses an inline glossary with GLOSSARY_NOT_FILE_BACKED and writes nothing", async () => {
    const store = new Map<string, string>();
    const loaded: LoadedConfig = {
      config: baseStudioConfig({ glossary: { hello: "hola" } }),
      source: { kind: "override" },
      glossary: { source: "inline" },
    };

    await expect(
      glossaryWriteHandler(
        { term: "cli", translation: "CLI" },
        deps(loaded, "/project", fakeGlossaryFs(store)),
      ),
    ).rejects.toMatchObject({ code: "GLOSSARY_NOT_FILE_BACKED" });
    expect(store.size).toBe(0);
  });

  it("refuses a project with no glossary at all with GLOSSARY_NOT_FILE_BACKED", async () => {
    const loaded: LoadedConfig = {
      config: baseStudioConfig(),
      source: { kind: "override" },
      glossary: { source: "none" },
    };

    await expect(
      glossaryWriteHandler(
        { term: "cli", translation: "CLI" },
        deps(loaded, "/project", fakeGlossaryFs(new Map())),
      ),
    ).rejects.toMatchObject({ code: "GLOSSARY_NOT_FILE_BACKED" });
  });

  it("redacts a secret-shaped value in the state it returns", async () => {
    const store = new Map([["/project/glossary.json", '{"hello":"hola"}']]);

    const result = await glossaryWriteHandler(
      { term: "apiTerm", translation: "sk-abcdEFGH12345678" },
      deps(fileBacked({ hello: "hola" }), "/project", fakeGlossaryFs(store)),
    );

    expect(termMapOf(result).apiTerm).toBe("[REDACTED]");
    expect(result.redactedTerms).toEqual(["apiTerm"]);
    expect(store.get("/project/glossary.json")).toContain("sk-abcdEFGH12345678");
  });
});

describe("glossary handlers on a version 2 glossary", () => {
  const V2 = JSON.stringify({
    version: 2,
    terms: [
      { source: "Dashboard", target: "Dashboard", targets: { de: "Übersicht" } },
      { source: "Save", target: "Speichern" },
    ],
  });

  it("lists an inline version 2 glossary", async () => {
    const result = await glossaryGetHandler(
      {},
      deps({
        config: baseStudioConfig({
          glossary: { version: 2, terms: [{ source: "Save", target: "Speichern" }] },
        }),
        source: { kind: "override" },
        glossary: { source: "inline" },
      }),
    );

    expect(termMapOf(result)).toEqual({ Save: "Speichern" });
  });

  it("clears only the shared translation for null and keeps a term that still has others", async () => {
    const store = new Map([["/project/glossary.json", V2]]);

    const result = await glossaryWriteHandler(
      { term: "Dashboard", translation: null },
      deps(fileBacked({}), "/project", fakeGlossaryFs(store)),
    );

    expect(termMapOf(result)).toEqual({ Dashboard: undefined, Save: "Speichern" });
    expect(JSON.parse(store.get("/project/glossary.json") ?? "{}").terms).toEqual([
      { source: "Dashboard", targets: { de: "Übersicht" } },
      { source: "Save", target: "Speichern" },
    ]);
  });
});

describe("glossary handlers: per-locale views", () => {
  const PER_LOCALE = JSON.stringify({
    version: 2,
    terms: [
      {
        source: "Dashboard",
        target: "Dashboard",
        targets: { de: "Übersicht" },
        forbidden: { de: ["Instrumententafel"] },
        note: "Start page",
        partOfSpeech: "noun",
        caseSensitive: true,
      },
      { source: "Board", forbidden: { fr: ["Planche"] } },
    ],
    doNotTranslate: ["verbatra"],
  });

  function perLocaleDeps(store: Map<string, string>) {
    return deps(
      {
        config: baseStudioConfig({ targetLocales: ["de", "fr"] }),
        source: { kind: "override" },
        glossary: { source: "file", path: "/project/glossary.json" },
      },
      "/project",
      fakeGlossaryFs(store),
    );
  }

  it("resolves every term for every target locale and marks what is inherited", async () => {
    const result = await glossaryGetHandler(
      {},
      perLocaleDeps(new Map([["/project/glossary.json", PER_LOCALE]])),
    );

    expect(result.version).toBe(2);
    expect(result.locales).toEqual(["de", "fr"]);
    expect(result.doNotTranslate).toEqual([{ term: "verbatra", caseSensitive: true }]);
    expect(result.terms[0]).toEqual({
      source: "Dashboard",
      target: "Dashboard",
      targets: { de: "Übersicht" },
      forbidden: { de: ["Instrumententafel"] },
      caseSensitive: true,
      note: "Start page",
      partOfSpeech: "noun",
      byLocale: {
        de: { target: "Übersicht", inherited: false, forbidden: ["Instrumententafel"] },
        fr: { target: "Dashboard", inherited: true, forbidden: [] },
      },
    });
    expect(result.terms[1]?.byLocale).toEqual({
      fr: { inherited: true, forbidden: ["Planche"] },
    });
  });

  it("writes one locale's translation and forbidden renderings", async () => {
    const store = new Map([["/project/glossary.json", PER_LOCALE]]);

    const result = await glossaryWriteHandler(
      { term: "Board", locale: "fr", translation: "Tableau", forbidden: null },
      perLocaleDeps(store),
    );

    expect(result.terms[1]?.byLocale.fr).toEqual({
      target: "Tableau",
      inherited: false,
      forbidden: [],
    });
  });

  it("keeps a term untranslated", async () => {
    const store = new Map([["/project/glossary.json", PER_LOCALE]]);

    const result = await glossaryWriteHandler(
      { term: "Acme", doNotTranslate: true, caseSensitive: false },
      perLocaleDeps(store),
    );

    expect(result.doNotTranslate).toEqual([
      { term: "verbatra", caseSensitive: true },
      { term: "Acme", caseSensitive: false },
    ]);
  });

  it("refuses a locale that is not a configured target locale and writes nothing", async () => {
    const store = new Map([["/project/glossary.json", PER_LOCALE]]);

    await expect(
      glossaryWriteHandler({ term: "Board", locale: "it", translation: "x" }, perLocaleDeps(store)),
    ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
    expect(store.get("/project/glossary.json")).toBe(PER_LOCALE);
  });

  it.each(["__proto__", "constructor", "prototype"])("keeps a term named %s", async (name) => {
    const store = new Map([["/project/glossary.json", `{"${name}":"Wert","hello":"hola"}`]]);

    const result = await glossaryGetHandler({}, perLocaleDeps(store));

    expect(result.terms.map((term) => [term.source, term.target])).toEqual([
      [name, "Wert"],
      ["hello", "hola"],
    ]);
    expect(result.terms[0]?.byLocale.de).toEqual({
      target: "Wert",
      inherited: true,
      forbidden: [],
    });
  });
});
