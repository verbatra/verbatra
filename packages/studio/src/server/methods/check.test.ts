import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LoadedConfig } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { statusCheckHandler } from "./check.js";

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

describe("statusCheckHandler", () => {
  it("reports a zero-key source project as 100 percent in sync, not an error", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, {});
    try {
      const result = await statusCheckHandler({}, deps(project));

      expect(result.inSync).toBe(true);
      expect(result.locales).toEqual([
        { locale: "de", missing: 0, stale: 0, upToDate: 0, inSync: true },
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("reports every key missing when the target file does not exist yet (pre-first-translate)", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const result = await statusCheckHandler({}, deps(project));

      expect(result.inSync).toBe(false);
      expect(result.locales).toEqual([
        { locale: "de", missing: 1, stale: 0, upToDate: 0, inSync: false },
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("reports drift via missing-only keys when the target has some but not all source keys", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"] },
      { greeting: "hello", farewell: "bye" },
    );
    try {
      await writeTargetFile(project, "de", { greeting: "hallo" });

      const result = await statusCheckHandler({}, deps(project));

      expect(result.inSync).toBe(false);
      expect(result.locales).toEqual([
        { locale: "de", missing: 1, stale: 0, upToDate: 1, inSync: false },
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("checks only the requested locale subset, in config order", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de", "fr"] },
      { greeting: "hello" },
    );
    try {
      await writeTargetFile(project, "de", { greeting: "hallo" });
      await writeTargetFile(project, "fr", { greeting: "bonjour" });

      const result = await statusCheckHandler({ locales: ["fr"] }, deps(project));

      expect(result.locales.map((locale) => locale.locale)).toEqual(["fr"]);
      expect(result.inSync).toBe(true);
    } finally {
      await project.cleanup();
    }
  });

  it("rejects an unknown requested locale as a domain error instead of throwing an internal one", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await writeTargetFile(project, "de", { greeting: "hallo" });

      await expect(statusCheckHandler({ locales: ["es"] }, deps(project))).rejects.toMatchObject({
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
      const first = await statusCheckHandler({}, deps(project));
      expect(first.locales).toEqual([
        { locale: "de", missing: 1, stale: 0, upToDate: 0, inSync: false },
      ]);

      await writeTargetFile(project, "de", { greeting: "hallo" });

      const second = await statusCheckHandler({}, deps(project));
      expect(second.locales).toEqual([
        { locale: "de", missing: 0, stale: 0, upToDate: 1, inSync: true },
      ]);
    } finally {
      await project.cleanup();
    }
  });
});
