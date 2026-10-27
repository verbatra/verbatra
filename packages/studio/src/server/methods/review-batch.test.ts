import { access, mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type CreateProvider,
  createDefaultRegistry,
  editEntry,
  type LoadedConfig,
  loadProvenance,
  type SdkFs,
} from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import {
  retranslateEntriesHandler,
  reviewApproveManyHandler,
  reviewRejectManyHandler,
} from "./review-batch.js";

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

const stubCreateProvider: CreateProvider = () => ({
  id: "stub",
  kind: "llm",
  supportsGlossary: true,
  translateBatch: async (request) => ({
    values: new Map(request.entries.map((entry) => [entry.key, `[stub] ${entry.value}`])),
    integrity: new Map(),
  }),
});

function deps(project: FixtureProject, extra: Partial<RpcHandlerDeps> = {}): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: project.root, ...extra };
}

async function agentEditedProject(): Promise<FixtureProject> {
  const project = await makeFixtureProject(
    { targetLocales: ["de"] },
    { greeting: "hello", farewell: "bye" },
  );
  for (const [key, value] of [
    ["greeting", "hallo"],
    ["farewell", "tschuess"],
  ] as const) {
    await editEntry({
      config: project.config,
      cwd: project.root,
      locale: "de",
      key,
      value,
      actor: "agent",
    });
  }
  return project;
}

async function withProject(run: (project: FixtureProject) => Promise<void>): Promise<void> {
  const project = await agentEditedProject();
  try {
    await run(project);
  } finally {
    await project.cleanup();
  }
}

describe("reviewApproveManyHandler", () => {
  it("approves every entry through the sdk and reports each outcome in order", async () => {
    await withProject(async (project) => {
      const result = await reviewApproveManyHandler(
        {
          entries: [
            { locale: "de", key: "greeting", expectedValue: "hallo" },
            { locale: "de", key: "farewell", expectedValue: "changed meanwhile" },
          ],
        },
        deps(project),
      );

      expect(result.results).toEqual([
        {
          ok: true,
          locale: "de",
          key: "greeting",
          provenance: { origin: "agent", reviewState: "approved" },
        },
        expect.objectContaining({ ok: false, key: "farewell", code: "REVIEW_VALUE_CHANGED" }),
      ]);
      const records = (await loadProvenance({ cwd: project.root })).locales.de;
      expect(records?.greeting?.reviewState).toBe("approved");
      expect(records?.farewell?.reviewState).toBeUndefined();
    });
  });

  it("passes the injected file system and adapter registry on to the sdk", async () => {
    await withProject(async (project) => {
      const result = await reviewApproveManyHandler(
        { entries: [{ locale: "de", key: "greeting", expectedValue: "hallo" }] },
        deps(project, { fs: realFs, adapterRegistry: createDefaultRegistry() }),
      );

      expect(result.results[0]?.ok).toBe(true);
    });
  });
});

describe("reviewRejectManyHandler", () => {
  it("removes every rejected translation", async () => {
    await withProject(async (project) => {
      const result = await reviewRejectManyHandler(
        {
          entries: [
            { locale: "de", key: "greeting", expectedValue: "hallo" },
            { locale: "de", key: "farewell", expectedValue: "tschuess" },
          ],
        },
        deps(project),
      );

      expect(result.results.map((outcome) => outcome.ok)).toEqual([true, true]);
      const written = await readFile(join(project.root, "locales", "de.json"), "utf8");
      expect(JSON.parse(written)).toEqual({});
    });
  });
});

describe("retranslateEntriesHandler", () => {
  it("retranslates every entry through the injected provider", async () => {
    await withProject(async (project) => {
      const result = await retranslateEntriesHandler(
        {
          entries: [
            { locale: "de", key: "greeting" },
            { locale: "de", key: "farewell" },
          ],
        },
        deps(project, { createProvider: stubCreateProvider, fs: realFs }),
      );

      expect(result.results).toEqual([
        {
          ok: true,
          locale: "de",
          key: "greeting",
          result: { accepted: true, value: "[stub] hello", reviewReasons: [] },
        },
        {
          ok: true,
          locale: "de",
          key: "farewell",
          result: { accepted: true, value: "[stub] bye", reviewReasons: [] },
        },
      ]);
    });
  });

  it("never replaces a value a person wrote, since the batch carries no includeHuman", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await editEntry({
        config: project.config,
        cwd: project.root,
        locale: "de",
        key: "greeting",
        value: "Hallo",
      });

      const result = await retranslateEntriesHandler(
        { entries: [{ locale: "de", key: "greeting" }] },
        deps(project, { createProvider: stubCreateProvider }),
      );

      expect(result.results[0]).toMatchObject({ ok: false, code: "KEY_PROTECTED" });
    } finally {
      await project.cleanup();
    }
  });

  it("builds the configured provider when none is injected, so a disabled provider fails each entry", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"], provider: { id: "none", options: {} } },
      { greeting: "hello" },
    );
    try {
      const result = await retranslateEntriesHandler(
        { entries: [{ locale: "de", key: "greeting" }] },
        deps(project),
      );

      expect(result.results[0]).toMatchObject({
        ok: false,
        code: "MACHINE_TRANSLATION_DISABLED",
      });
    } finally {
      await project.cleanup();
    }
  });
});
