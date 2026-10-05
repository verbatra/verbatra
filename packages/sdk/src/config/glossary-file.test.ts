import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { makeFakeFs, makeTempDir, readTextFile } from "../test-support.js";
import type { Glossary } from "./glossary.js";
import {
  type GlossaryFileDeps,
  MAX_GLOSSARY_FILE_BYTES,
  readGlossaryFile,
  updateGlossaryTerm,
} from "./glossary-file.js";
import type { GlossaryProvenance } from "./resolve-glossary.js";
import { resolveGlossary } from "./resolve-glossary.js";

async function seedGlossary(content: string): Promise<{ cwd: string; path: string }> {
  const cwd = await makeTempDir();
  const path = join(cwd, "glossary.json");
  await writeFile(path, content, "utf8");
  return { cwd, path };
}

function termMap(glossary: Glossary): Record<string, string | undefined> {
  return Object.fromEntries(glossary.terms.map((term) => [term.source, term.target]));
}

function fileProvenance(path: string): GlossaryProvenance {
  return { source: "file", path };
}

async function expectSdkError(promise: Promise<unknown>, code: string): Promise<SdkError> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(SdkError);
  expect((error as SdkError).code).toBe(code);
  return error as SdkError;
}

describe("readGlossaryFile", () => {
  it("reads the current file content rather than a cached copy", async () => {
    const { path } = await seedGlossary('{\n  "brand": "Verbatra"\n}\n');
    const first = await readGlossaryFile({ glossary: fileProvenance(path) });
    await writeFile(path, '{\n  "brand": "Verbatra",\n  "cli": "CLI"\n}\n', "utf8");
    const second = await readGlossaryFile({ glossary: fileProvenance(path) });

    expect(termMap(first)).toEqual({ brand: "Verbatra" });
    expect(termMap(second)).toEqual({ brand: "Verbatra", cli: "CLI" });
  });

  it("refuses an inline glossary with GLOSSARY_NOT_FILE_BACKED", async () => {
    const error = await expectSdkError(
      readGlossaryFile({ glossary: { source: "inline" } }),
      "GLOSSARY_NOT_FILE_BACKED",
    );
    expect(error.message).toContain("inline");
  });

  it("refuses an absent glossary with GLOSSARY_NOT_FILE_BACKED", async () => {
    const error = await expectSdkError(
      readGlossaryFile({ glossary: { source: "none" } }),
      "GLOSSARY_NOT_FILE_BACKED",
    );
    expect(error.message).toContain("not configured");
  });

  it("reports a missing file as CONFIG_INVALID", async () => {
    const cwd = await makeTempDir();
    await expectSdkError(
      readGlossaryFile({ glossary: fileProvenance(join(cwd, "absent.json")) }),
      "CONFIG_INVALID",
    );
  });

  it("reports a file that is not a flat string map as CONFIG_INVALID", async () => {
    const { path } = await seedGlossary('{\n  "brand": { "nested": true }\n}\n');
    await expectSdkError(readGlossaryFile({ glossary: fileProvenance(path) }), "CONFIG_INVALID");
  });

  it("reports an oversized file as CONFIG_INVALID", async () => {
    const fs = makeFakeFs({
      readFileBounded: async () => ({ kind: "too-large" }),
    });
    await expectSdkError(
      readGlossaryFile({ glossary: fileProvenance("/tmp/glossary.json") }, { fs }),
      "CONFIG_INVALID",
    );
  });
});

describe("updateGlossaryTerm", () => {
  it("adds a new term by appending it and leaves the existing order untouched", async () => {
    const { cwd, path } = await seedGlossary('{\n  "brand": "Verbatra",\n  "cli": "CLI"\n}\n');

    const entries = await updateGlossaryTerm({
      glossary: fileProvenance(path),
      cwd,
      term: "sdk",
      translation: "SDK",
    });

    expect(Object.keys(termMap(entries))).toEqual(["brand", "cli", "sdk"]);
    expect(await readTextFile(path)).toBe(
      '{\n  "brand": "Verbatra",\n  "cli": "CLI",\n  "sdk": "SDK"\n}\n',
    );
  });

  it("replaces a term in place without moving it to the end", async () => {
    const { cwd, path } = await seedGlossary(
      '{\n  "brand": "Verbatra",\n  "cli": "CLI",\n  "sdk": "SDK"\n}\n',
    );

    const entries = await updateGlossaryTerm({
      glossary: fileProvenance(path),
      cwd,
      term: "cli",
      translation: "Kommandozeile",
    });

    expect(Object.keys(termMap(entries))).toEqual(["brand", "cli", "sdk"]);
    expect(termMap(entries).cli).toBe("Kommandozeile");
  });

  it("removes a term when the translation is null", async () => {
    const { cwd, path } = await seedGlossary('{\n  "brand": "Verbatra",\n  "cli": "CLI"\n}\n');

    const entries = await updateGlossaryTerm({
      glossary: fileProvenance(path),
      cwd,
      term: "cli",
      translation: null,
    });

    expect(termMap(entries)).toEqual({ brand: "Verbatra" });
    expect(await readTextFile(path)).toBe('{\n  "brand": "Verbatra"\n}\n');
  });

  it("removing a term that is not present leaves the file unchanged", async () => {
    const content = '{\n  "brand": "Verbatra"\n}\n';
    const { cwd, path } = await seedGlossary(content);

    const entries = await updateGlossaryTerm({
      glossary: fileProvenance(path),
      cwd,
      term: "absent",
      translation: null,
    });

    expect(termMap(entries)).toEqual({ brand: "Verbatra" });
    expect(await readTextFile(path)).toBe(content);
  });

  it("keeps a four-space indented file four-space indented", async () => {
    const { cwd, path } = await seedGlossary('{\n    "brand": "Verbatra"\n}\n');

    await updateGlossaryTerm({
      glossary: fileProvenance(path),
      cwd,
      term: "cli",
      translation: "CLI",
    });

    expect(await readTextFile(path)).toBe('{\n    "brand": "Verbatra",\n    "cli": "CLI"\n}\n');
  });

  it("keeps a tab indented file tab indented", async () => {
    const { cwd, path } = await seedGlossary('{\n\t"brand": "Verbatra"\n}\n');

    await updateGlossaryTerm({
      glossary: fileProvenance(path),
      cwd,
      term: "cli",
      translation: "CLI",
    });

    expect(await readTextFile(path)).toBe('{\n\t"brand": "Verbatra",\n\t"cli": "CLI"\n}\n');
  });

  it("does not add a trailing newline to a file that had none", async () => {
    const { cwd, path } = await seedGlossary('{"brand":"Verbatra"}');

    await updateGlossaryTerm({
      glossary: fileProvenance(path),
      cwd,
      term: "cli",
      translation: "CLI",
    });

    const written = await readTextFile(path);
    expect(written.endsWith("\n")).toBe(false);
    expect(JSON.parse(written)).toEqual({ brand: "Verbatra", cli: "CLI" });
  });

  it("writes a value the config loader accepts unchanged, read back through resolveGlossary", async () => {
    const { cwd, path } = await seedGlossary('{\n  "brand": "Verbatra"\n}\n');

    await updateGlossaryTerm({
      glossary: fileProvenance(path),
      cwd,
      term: "Grüße",
      translation: "Greetings {name}",
    });

    const resolved = await resolveGlossary("glossary.json", cwd, defaultFs);

    expect(resolved.provenance).toEqual({ source: "file", path });
    expect(resolved.glossary).toEqual({ brand: "Verbatra", Grüße: "Greetings {name}" });
  });

  it("refuses an inline glossary before it validates the term", async () => {
    await expectSdkError(
      updateGlossaryTerm({ glossary: { source: "inline" }, term: "", translation: null }),
      "GLOSSARY_NOT_FILE_BACKED",
    );
  });

  it("refuses a blank term without touching the file", async () => {
    const content = '{\n  "brand": "Verbatra"\n}\n';
    const { cwd, path } = await seedGlossary(content);

    await expectSdkError(
      updateGlossaryTerm({
        glossary: fileProvenance(path),
        cwd,
        term: "   ",
        translation: "value",
      }),
      "CONFIG_INVALID",
    );
    expect(await readTextFile(path)).toBe(content);
  });

  it("refuses a blank translation and points at removal instead", async () => {
    const { cwd, path } = await seedGlossary('{\n  "brand": "Verbatra"\n}\n');

    const error = await expectSdkError(
      updateGlossaryTerm({ glossary: fileProvenance(path), cwd, term: "brand", translation: " " }),
      "CONFIG_INVALID",
    );
    expect(error.message).toContain("Remove the term instead");
  });

  it("refuses an edit whose result would exceed the glossary size limit", async () => {
    const { cwd, path } = await seedGlossary('{\n  "brand": "Verbatra"\n}\n');

    await expectSdkError(
      updateGlossaryTerm({
        glossary: fileProvenance(path),
        cwd,
        term: "huge",
        translation: "x".repeat(MAX_GLOSSARY_FILE_BYTES),
      }),
      "CONFIG_INVALID",
    );
    expect(await readTextFile(path)).toBe('{\n  "brand": "Verbatra"\n}\n');
  });

  it("wraps a failing write as GLOSSARY_UNWRITABLE", async () => {
    const fs: SdkFs = makeFakeFs({
      readFileBounded: async () => ({ kind: "ok", content: '{"brand":"Verbatra"}' }),
      writeFile: async () => {
        throw new Error("EACCES: permission denied");
      },
    });

    const error = await expectSdkError(
      updateGlossaryTerm(
        {
          glossary: fileProvenance("/tmp/glossary.json"),
          cwd: "/tmp",
          term: "cli",
          translation: "CLI",
        },
        { fs },
      ),
      "GLOSSARY_UNWRITABLE",
    );
    expect(error.message).toContain("permission denied");
  });

  it("reports a non-Error write failure without losing what was thrown", async () => {
    const fs: SdkFs = makeFakeFs({
      readFileBounded: async () => ({ kind: "ok", content: '{"brand":"Verbatra"}' }),
      writeFile: async () => {
        throw "disk gone";
      },
    });

    const error = await expectSdkError(
      updateGlossaryTerm(
        {
          glossary: fileProvenance("/tmp/glossary.json"),
          cwd: "/tmp",
          term: "cli",
          translation: "CLI",
        },
        { fs },
      ),
      "GLOSSARY_UNWRITABLE",
    );
    expect(error.message).toContain("disk gone");
  });

  it("serializes two concurrent edits so neither loses the other's term", async () => {
    const { cwd, path } = await seedGlossary('{\n  "brand": "Verbatra"\n}\n');
    const deps: GlossaryFileDeps = {};

    await Promise.all([
      updateGlossaryTerm(
        { glossary: fileProvenance(path), cwd, term: "cli", translation: "CLI" },
        deps,
      ),
      updateGlossaryTerm(
        { glossary: fileProvenance(path), cwd, term: "sdk", translation: "SDK" },
        deps,
      ),
    ]);

    expect(JSON.parse(await readTextFile(path))).toEqual({
      brand: "Verbatra",
      cli: "CLI",
      sdk: "SDK",
    });
  });

  it("never runs two critical sections at once, even when the write is slow", async () => {
    let inside = 0;
    let peak = 0;
    const store = new Map<string, string>([["/tmp/glossary.json", '{"brand":"Verbatra"}']]);
    const locks = new Map<string, string>();
    const fs: SdkFs = makeFakeFs({
      readFileBounded: async (path: string) => {
        if (path.endsWith(".lock")) {
          const lock = locks.get(path);
          return lock === undefined ? { kind: "missing" } : { kind: "ok", content: lock };
        }
        inside += 1;
        peak = Math.max(peak, inside);
        const content = store.get(path);
        return content === undefined ? { kind: "missing" } : { kind: "ok", content };
      },
      writeFile: async (path: string, data: string) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        store.set(path, data);
        inside -= 1;
      },
      createExclusive: async (path: string, data: string) => {
        if (locks.has(path)) {
          return false;
        }
        locks.set(path, data);
        return true;
      },
      deleteFile: async (path: string) => {
        locks.delete(path);
      },
    });

    await Promise.all([
      updateGlossaryTerm(
        {
          glossary: fileProvenance("/tmp/glossary.json"),
          cwd: "/tmp",
          term: "cli",
          translation: "CLI",
        },
        { fs },
      ),
      updateGlossaryTerm(
        {
          glossary: fileProvenance("/tmp/glossary.json"),
          cwd: "/tmp",
          term: "sdk",
          translation: "SDK",
        },
        { fs },
      ),
    ]);

    expect(peak).toBe(1);
    expect(JSON.parse(store.get("/tmp/glossary.json") ?? "{}")).toEqual({
      brand: "Verbatra",
      cli: "CLI",
      sdk: "SDK",
    });
  });
});
