import { access, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CreateProvider, LoadedConfig, SdkFs } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { translatePendingHandler } from "./translate-pending.js";

function realFsWithFailingLockWrite(failingLocale: string): SdkFs {
  return {
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
      if (path.endsWith("verbatra.lock.json") && data.includes(`"${failingLocale}"`)) {
        throw Object.assign(new Error("lock write failed"), { code: "LOCK_FILE_WRITE" });
      }
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
}

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

describe("translatePendingHandler", () => {
  it("refuses with MACHINE_TRANSLATION_DISABLED under provider none, constructing nothing", async () => {
    const project = await makeFixtureProject(
      { provider: { id: "none", options: {} } },
      { greeting: "hello" },
    );
    const factoryCalls: string[] = [];
    try {
      const error = await translatePendingHandler(
        {},
        deps(project, (config) => {
          factoryCalls.push(config.id);
          return stubCreateProvider(config);
        }),
      ).catch((caught: unknown) => caught);

      expect(error).toMatchObject({ name: "SdkError", code: "MACHINE_TRANSLATION_DISABLED" });
      expect(factoryCalls).toEqual([]);
    } finally {
      await project.cleanup();
    }
  });

  it("delegates to the sdk's unfiltered translate() and returns the whole RunSummary", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de", "fr"] },
      { greeting: "hello" },
    );
    try {
      const result = await translatePendingHandler({}, deps(project, stubCreateProvider));

      expect(result.dryRun).toBe(false);
      expect([...result.succeeded].sort()).toEqual(["de", "fr"]);
      expect(result.failed).toEqual([]);

      const de = await readFile(join(project.root, "locales", "de.json"), "utf8");
      expect(JSON.parse(de)).toEqual({ greeting: "[stub] hello" });
      const fr = await readFile(join(project.root, "locales", "fr.json"), "utf8");
      expect(JSON.parse(fr)).toEqual({ greeting: "[stub] hello" });
    } finally {
      await project.cleanup();
    }
  });

  it("surfaces a thrown provider call as providerFailures data on a failed locale, not a throw", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const throwingProvider: CreateProvider = () => ({
        id: "stub",
        kind: "llm",
        supportsGlossary: true,
        translateBatch: async () => {
          throw new Error("provider unavailable");
        },
      });

      const result = await translatePendingHandler({}, deps(project, throwingProvider));

      expect(result.succeeded).toEqual([]);
      expect(result.failed).toEqual(["de"]);
      expect(result.locales[0]?.status).toBe("failed");
      expect(result.locales[0]?.providerFailures).toEqual(["greeting"]);
    } finally {
      await project.cleanup();
    }
  });

  it("surfaces a genuine per-locale failure (a failed lock write) as data on the returned RunSummary, not a throw", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de", "fr"] },
      { greeting: "hello" },
    );
    try {
      const result = await translatePendingHandler(
        {},
        { ...deps(project, stubCreateProvider), fs: realFsWithFailingLockWrite("de") },
      );

      expect(result.succeeded).toEqual(["fr"]);
      expect(result.failed).toEqual(["de"]);
      expect(result.locales.find((locale) => locale.locale === "de")?.status).toBe("failed");
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
      const result = await translatePendingHandler(
        {},
        { config: loaded, projectRoot: project.root, createProvider: stubCreateProvider },
      );

      expect(result.succeeded).toEqual(["de"]);
    } finally {
      await project.cleanup();
    }
  });
});
