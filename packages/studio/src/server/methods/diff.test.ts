import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LoadedConfig } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { statusDiffHandler } from "./diff.js";

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

describe("statusDiffHandler", () => {
  it("reports no pending changes when the target already covers every source key", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await writeTargetFile(project, "de", { greeting: "hallo" });

      const result = await statusDiffHandler({}, deps(project));

      expect(result.hasPendingChanges).toBe(false);
      expect(result.locales).toEqual([
        { locale: "de", missing: [], changed: [], orphaned: [], hasPendingChanges: false },
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("reports missing and orphaned keys, with hasPendingChanges true at both levels", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"] },
      { greeting: "hello", farewell: "bye" },
    );
    try {
      await writeTargetFile(project, "de", { farewell: "bye", extra: "leftover" });

      const result = await statusDiffHandler({}, deps(project));

      expect(result.hasPendingChanges).toBe(true);
      expect(result.locales).toEqual([
        {
          locale: "de",
          missing: ["greeting"],
          changed: [],
          orphaned: ["extra"],
          hasPendingChanges: true,
        },
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("diffs only the requested locale subset, in config order", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de", "fr"] },
      { greeting: "hello" },
    );
    try {
      await writeTargetFile(project, "de", {});
      await writeTargetFile(project, "fr", { greeting: "bonjour" });

      const result = await statusDiffHandler({ locales: ["fr"] }, deps(project));

      expect(result.locales.map((locale) => locale.locale)).toEqual(["fr"]);
      expect(result.hasPendingChanges).toBe(false);
    } finally {
      await project.cleanup();
    }
  });

  it("rejects an unknown requested locale as a domain error instead of throwing an internal one", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await expect(statusDiffHandler({ locales: ["es"] }, deps(project))).rejects.toMatchObject({
        name: "SdkError",
        code: "UNKNOWN_LOCALE",
      });
    } finally {
      await project.cleanup();
    }
  });

  it("reads the target file fresh on every call, never caching it between requests", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const first = await statusDiffHandler({}, deps(project));
      expect(first.locales).toEqual([
        { locale: "de", missing: ["greeting"], changed: [], orphaned: [], hasPendingChanges: true },
      ]);

      await writeTargetFile(project, "de", { greeting: "hallo" });

      const second = await statusDiffHandler({}, deps(project));
      expect(second.locales).toEqual([
        { locale: "de", missing: [], changed: [], orphaned: [], hasPendingChanges: false },
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("returns every key uncapped, even for a large key set, with no server-side truncation", async () => {
    const keyCount = 50_000;
    const sourceEntries: Record<string, string> = {};
    for (let index = 0; index < keyCount; index += 1) {
      sourceEntries[`key.${index}`] = `value ${index}`;
    }
    const project = await makeFixtureProject({ targetLocales: ["de"] }, sourceEntries);
    try {
      const result = await statusDiffHandler({}, deps(project));

      expect(result.locales).toHaveLength(1);
      expect(result.locales[0]?.missing).toHaveLength(keyCount);
      expect(result.hasPendingChanges).toBe(true);
    } finally {
      await project.cleanup();
    }
  }, 20_000);
});
