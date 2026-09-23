import { access, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type LoadedConfig, loadProvenance, type SdkFs } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { editEntryHandler } from "./edit-entry.js";

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

function deps(project: FixtureProject): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: project.root };
}

async function storedOrigin(project: FixtureProject): Promise<string | undefined> {
  const loaded = await loadProvenance({ cwd: project.root });
  return loaded.locales.de?.greeting?.origin;
}

describe("editEntryHandler: provenance", () => {
  it("records human when the dialog omits the actor", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await editEntryHandler({ locale: "de", key: "greeting", value: "Hallo" }, deps(project));

      expect(await storedOrigin(project)).toBe("human");
    } finally {
      await project.cleanup();
    }
  });

  it("records agent when the WebMCP tool passes actor agent", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await editEntryHandler(
        { locale: "de", key: "greeting", value: "Hallo", actor: "agent" },
        deps(project),
      );

      expect(await storedOrigin(project)).toBe("agent");
    } finally {
      await project.cleanup();
    }
  });
});

describe("editEntryHandler", () => {
  it("delegates to the sdk seam and returns its accepted result", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const result = await editEntryHandler(
        { locale: "de", key: "greeting", value: "Hallo" },
        deps(project),
      );

      expect(result).toEqual({ accepted: true, value: "Hallo" });
      const written = await readFile(join(project.root, "locales", "de.json"), "utf8");
      expect(JSON.parse(written)).toEqual({ greeting: "Hallo" });
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
      const result = await editEntryHandler(
        { locale: "de", key: "greeting", value: "Hallo" },
        deps(project),
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
        editEntryHandler({ locale: "de", key: "missing", value: "Hallo" }, deps(project)),
      ).rejects.toMatchObject({ code: "UNKNOWN_KEY" });
    } finally {
      await project.cleanup();
    }
  });

  it("throws the sdk's UNKNOWN_LOCALE for a locale not among the configured targets", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await expect(
        editEntryHandler({ locale: "fr", key: "greeting", value: "Bonjour" }, deps(project)),
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
      const result = await editEntryHandler(
        { locale: "de", key: "greeting", value: "Hallo" },
        { config: loaded, projectRoot: project.root },
      );

      expect(result.accepted).toBe(true);
    } finally {
      await project.cleanup();
    }
  });

  it("threads an explicitly given deps.fs through to the sdk seam", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const result = await editEntryHandler(
        { locale: "de", key: "greeting", value: "Hallo" },
        { ...deps(project), fs: realFs },
      );

      expect(result).toEqual({ accepted: true, value: "Hallo" });
    } finally {
      await project.cleanup();
    }
  });

  it("throws UNKNOWN_KEY, writing nothing, when the key was removed from the source before the edit was submitted", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"] },
      { greeting: "hello", farewell: "bye" },
    );
    try {
      await writeFile(
        join(project.root, "locales", "en.json"),
        `${JSON.stringify({ farewell: "bye" }, null, 2)}\n`,
        "utf8",
      );

      await expect(
        editEntryHandler({ locale: "de", key: "greeting", value: "Hallo" }, deps(project)),
      ).rejects.toMatchObject({ code: "UNKNOWN_KEY" });

      await expect(readFile(join(project.root, "locales", "de.json"), "utf8")).rejects.toThrow();
    } finally {
      await project.cleanup();
    }
  });
});
