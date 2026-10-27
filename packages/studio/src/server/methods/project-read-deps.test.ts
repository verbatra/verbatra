import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AdapterRegistry,
  createDefaultRegistry,
  LOCK_FILE_NAME,
  type LoadedConfig,
  type SdkFs,
} from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { statusCheckHandler } from "./check.js";
import { statusDiffHandler } from "./diff.js";
import { keyIntegrityHandler } from "./key-integrity.js";
import { lockStateHandler } from "./lock.js";

const CUSTOM_FORMAT = "custom:spy-json";

function customRegistry(): AdapterRegistry {
  const resolution = createDefaultRegistry().resolve("locales/en.json", {
    format: "i18next-json",
  });
  if (resolution.status !== "resolved") {
    throw new Error("the built-in i18next adapter did not resolve");
  }
  return new AdapterRegistry().register({ ...resolution.adapter, format: CUSTOM_FORMAT });
}

function recordingFs(seen: string[]): SdkFs {
  return {
    fileExists: async (path) => {
      seen.push(path);
      return access(path).then(
        () => true,
        () => false,
      );
    },
    readFileBounded: async (path) => {
      seen.push(path);
      try {
        return { kind: "ok", content: await readFile(path, "utf8") };
      } catch {
        return { kind: "missing" };
      }
    },
    readBytesBounded: async (path) => {
      seen.push(path);
      try {
        return { kind: "ok", bytes: new Uint8Array(await readFile(path)) };
      } catch {
        return { kind: "missing" };
      }
    },
    writeFile: async () => {},
    writeBytes: async () => {},
    createExclusive: async () => true,
    deleteFile: async () => {},
  };
}

function deps(project: FixtureProject, extra: Partial<RpcHandlerDeps> = {}): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: { ...project.config, format: CUSTOM_FORMAT },
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: project.root, ...extra };
}

async function lockedProject(): Promise<FixtureProject> {
  const project = await makeFixtureProject({ targetLocales: ["de"] });
  await writeFile(join(project.root, LOCK_FILE_NAME), '{ "version": 1, "locales": {} }', "utf8");
  return project;
}

const HANDLERS = [
  ["status.check", (d: RpcHandlerDeps) => statusCheckHandler({}, d)],
  ["status.diff", (d: RpcHandlerDeps) => statusDiffHandler({}, d)],
  ["lock.state", (d: RpcHandlerDeps) => lockStateHandler({}, d)],
  ["key.integrity", (d: RpcHandlerDeps) => keyIntegrityHandler({ key: "greeting" }, d)],
] as const;

describe("project read handlers: the injected StudioServerDeps seams", () => {
  it.each(HANDLERS)(
    "%s resolves a custom: format through the injected registry",
    async (_name, run) => {
      const project = await lockedProject();
      try {
        await expect(run(deps(project))).rejects.toMatchObject({ code: "UNKNOWN_FORMAT" });
        await expect(
          run(deps(project, { adapterRegistry: customRegistry() })),
        ).resolves.toBeDefined();
      } finally {
        await project.cleanup();
      }
    },
  );

  it.each(HANDLERS)("%s reads the project through the injected file system", async (_name, run) => {
    const project = await lockedProject();
    try {
      const seen: string[] = [];

      await run(deps(project, { adapterRegistry: customRegistry(), fs: recordingFs(seen) }));

      expect(seen.length).toBeGreaterThan(0);
    } finally {
      await project.cleanup();
    }
  });
});
