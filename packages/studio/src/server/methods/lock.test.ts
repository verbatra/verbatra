import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LoadedConfig } from "@verbatra/sdk";
import { LOCK_FILE_NAME } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { lockStateHandler } from "./lock.js";

function deps(project: FixtureProject): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: project.root };
}

async function writeTargetFile(
  project: FixtureProject,
  locale: string,
  entries: Readonly<Record<string, string>>,
): Promise<void> {
  await writeFile(
    join(project.root, "locales", `${locale}.json`),
    `${JSON.stringify(entries, null, 2)}\n`,
    "utf8",
  );
}

async function writeLock(
  project: FixtureProject,
  lock: { readonly version: number; readonly locales: Readonly<Record<string, unknown>> },
): Promise<void> {
  await writeFile(join(project.root, LOCK_FILE_NAME), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

describe("lockStateHandler", () => {
  it("reports exists: false when no lock-file is on disk yet", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const result = await lockStateHandler({}, deps(project));
      expect(result).toEqual({ exists: false });
    } finally {
      await project.cleanup();
    }
  });

  it("distinguishes an empty but present lock-file from a missing one", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await writeTargetFile(project, "de", { greeting: "hallo" });
      await writeLock(project, { version: 1, locales: {} });

      const result = await lockStateHandler({}, deps(project));

      expect(result.exists).toBe(true);
      if (!result.exists) {
        throw new Error("expected exists: true");
      }
      expect(result.version).toBe(1);
      expect(result.locales).toEqual([
        { locale: "de", keyCount: 0, missing: 0, stale: 0, upToDate: 1 },
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("reports per-locale key counts and drift for every configured target locale", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de", "fr"] },
      { greeting: "hello", farewell: "bye" },
    );
    try {
      await writeTargetFile(project, "de", { greeting: "hallo" });
      await writeTargetFile(project, "fr", { greeting: "bonjour", farewell: "au revoir" });
      await writeLock(project, {
        version: 1,
        locales: { fr: { greeting: "some-hash", farewell: "some-hash" } },
      });

      const result = await lockStateHandler({}, deps(project));

      expect(result.exists).toBe(true);
      if (!result.exists) {
        throw new Error("expected exists: true");
      }
      expect(result.locales).toEqual([
        { locale: "de", keyCount: 0, missing: 1, stale: 0, upToDate: 1 },
        { locale: "fr", keyCount: 2, missing: 0, stale: 2, upToDate: 0 },
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("reads the lock-file fresh on every call, never caching it between requests", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const first = await lockStateHandler({}, deps(project));
      expect(first).toEqual({ exists: false });

      await writeTargetFile(project, "de", { greeting: "hallo" });
      await writeLock(project, { version: 1, locales: {} });

      const second = await lockStateHandler({}, deps(project));
      expect(second).toEqual({
        exists: true,
        version: 1,
        locales: [{ locale: "de", keyCount: 0, missing: 0, stale: 0, upToDate: 1 }],
      });
    } finally {
      await project.cleanup();
    }
  });

  it("throws LOCK_FILE_INVALID as a domain error when the lock-file is corrupt", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await writeFile(join(project.root, LOCK_FILE_NAME), "not a lock object", "utf8");

      await expect(lockStateHandler({}, deps(project))).rejects.toMatchObject({
        name: "SdkError",
        code: "LOCK_FILE_INVALID",
      });
    } finally {
      await project.cleanup();
    }
  });
});
