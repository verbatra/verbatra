import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LoadedConfig } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { keyValueHandler } from "./key-value.js";

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

describe("keyValueHandler", () => {
  it("returns both the current source and target value when the key exists in both", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await writeTargetFile(project, "de", { greeting: "hallo" });

      const result = await keyValueHandler({ locale: "de", key: "greeting" }, deps(project));

      expect(result).toEqual({ source: "hello", target: "hallo" });
    } finally {
      await project.cleanup();
    }
  });

  it("omits target when the key does not yet exist in that target locale", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const result = await keyValueHandler({ locale: "de", key: "greeting" }, deps(project));

      expect(result).toEqual({ source: "hello" });
      expect(Object.hasOwn(result, "target")).toBe(false);
    } finally {
      await project.cleanup();
    }
  });

  it("throws the sdk's UNKNOWN_KEY for a key not present in the source", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await expect(
        keyValueHandler({ locale: "de", key: "missing" }, deps(project)),
      ).rejects.toMatchObject({ code: "UNKNOWN_KEY" });
    } finally {
      await project.cleanup();
    }
  });

  it("throws the sdk's UNKNOWN_LOCALE for a locale not among the configured targets", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await expect(
        keyValueHandler({ locale: "fr", key: "greeting" }, deps(project)),
      ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
    } finally {
      await project.cleanup();
    }
  });

  it("reads fresh on every call, never caching between requests", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const first = await keyValueHandler({ locale: "de", key: "greeting" }, deps(project));
      expect(first).toEqual({ source: "hello" });

      await writeTargetFile(project, "de", { greeting: "hallo" });

      const second = await keyValueHandler({ locale: "de", key: "greeting" }, deps(project));
      expect(second).toEqual({ source: "hello", target: "hallo" });
    } finally {
      await project.cleanup();
    }
  });
});
