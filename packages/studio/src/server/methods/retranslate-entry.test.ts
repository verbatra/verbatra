import { access, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type CreateProvider, editEntry, type LoadedConfig, type SdkFs } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { retranslateEntryHandler } from "./retranslate-entry.js";

const realFs: SdkFs = {
  fileExists: async (path) => {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
  readFileBounded: async (path) => {
    try {
      return { kind: "ok", content: await readFile(path, "utf8") };
    } catch {
      return { kind: "missing" };
    }
  },
  readBytesBounded: async () => ({ kind: "missing" }),
  writeFile: async (path, data) => {
    await writeFile(path, data, "utf8");
  },
  writeBytes: async () => {},
  createExclusive: async (path, data) => {
    await mkdir(dirname(path), { recursive: true });
    try {
      const handle = await open(path, "wx");
      try {
        await handle.writeFile(data, "utf8");
      } finally {
        await handle.close();
      }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return false;
      }
      throw error;
    }
  },
  deleteFile: async (path) => {
    await rm(path, { force: true });
  },
};

function deps(project: FixtureProject, createProvider: CreateProvider): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: project.root, createProvider };
}

const stubCreateProvider: CreateProvider = () => ({
  id: "stub",
  kind: "llm",
  supportsGlossary: true,
  translateBatch: async (request) => ({
    values: new Map(request.entries.map((entry) => [entry.key, `[stub] ${entry.value}`])),
    integrity: new Map(),
  }),
});

describe("retranslateEntryHandler", () => {
  it("refuses a value a person wrote unless includeHuman is passed", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await editEntry({
        config: project.config,
        cwd: project.root,
        locale: "de",
        key: "greeting",
        value: "Hallo",
      });

      await expect(
        retranslateEntryHandler(
          { locale: "de", key: "greeting" },
          deps(project, stubCreateProvider),
        ),
      ).rejects.toMatchObject({ code: "KEY_PROTECTED" });
      const result = await retranslateEntryHandler(
        { locale: "de", key: "greeting", includeHuman: true },
        deps(project, stubCreateProvider),
      );
      expect(result).toMatchObject({ accepted: true });
    } finally {
      await project.cleanup();
    }
  });

  it("delegates to the sdk seam and returns its accepted result", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const result = await retranslateEntryHandler(
        { locale: "de", key: "greeting" },
        deps(project, stubCreateProvider),
      );

      expect(result).toEqual({ accepted: true, value: "[stub] hello", reviewReasons: [] });
      const written = await readFile(join(project.root, "locales", "de.json"), "utf8");
      expect(JSON.parse(written)).toEqual({ greeting: "[stub] hello" });
    } finally {
      await project.cleanup();
    }
  });

  it("returns a rejection without writing when the candidate fails placeholder integrity", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"] },
      { greeting: "Hello {{name}}" },
    );
    try {
      const droppingProvider: CreateProvider = () => ({
        id: "stub",
        kind: "llm",
        supportsGlossary: true,
        translateBatch: async (request) => ({
          values: new Map(request.entries.map((entry) => [entry.key, "Hallo"])),
          integrity: new Map(),
        }),
      });

      const result = await retranslateEntryHandler(
        { locale: "de", key: "greeting" },
        deps(project, droppingProvider),
      );

      expect(result).toEqual({ accepted: false, reason: "placeholder", value: "Hallo" });
    } finally {
      await project.cleanup();
    }
  });

  it("throws the sdk's UNKNOWN_KEY for a key not present in the source", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await expect(
        retranslateEntryHandler(
          { locale: "de", key: "missing" },
          deps(project, stubCreateProvider),
        ),
      ).rejects.toMatchObject({ code: "UNKNOWN_KEY" });
    } finally {
      await project.cleanup();
    }
  });

  it("throws the sdk's UNKNOWN_LOCALE for a locale not among the configured targets", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await expect(
        retranslateEntryHandler(
          { locale: "fr", key: "greeting" },
          deps(project, stubCreateProvider),
        ),
      ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
    } finally {
      await project.cleanup();
    }
  });

  it("resolves fs and adapterRegistry from the sdk's own defaults when deps omits them", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const loaded: LoadedConfig = {
        config: project.config,
        source: { kind: "override" },
        glossary: { source: "none" },
      };
      const result = await retranslateEntryHandler(
        { locale: "de", key: "greeting" },
        { config: loaded, projectRoot: project.root, createProvider: stubCreateProvider },
      );

      expect(result.accepted).toBe(true);
    } finally {
      await project.cleanup();
    }
  });

  it("threads an explicitly given deps.fs through to the sdk seam", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const result = await retranslateEntryHandler(
        { locale: "de", key: "greeting" },
        { ...deps(project, stubCreateProvider), fs: realFs },
      );

      expect(result).toEqual({ accepted: true, value: "[stub] hello", reviewReasons: [] });
    } finally {
      await project.cleanup();
    }
  });
});
