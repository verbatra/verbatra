import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LoadedConfig } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { localeValuesHandler } from "./locale-values.js";

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

describe("localeValuesHandler", () => {
  it("returns source and target text for every configured target locale", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await writeTargetFile(project, "de", { greeting: "hallo" });

      const result = await localeValuesHandler({}, deps(project));

      expect(result).toEqual([
        { locale: "de", values: { greeting: { source: "hello", target: "hallo" } } },
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("omits target for a key not yet translated", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      const result = await localeValuesHandler({}, deps(project));

      expect(result[0]?.values.greeting).toEqual({ source: "hello" });
    } finally {
      await project.cleanup();
    }
  });

  it("omits source for an orphaned key present only in the target", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await writeTargetFile(project, "de", { greeting: "hallo", legacy: "old" });

      const result = await localeValuesHandler({}, deps(project));

      expect(result[0]?.values.legacy).toEqual({ target: "old" });
    } finally {
      await project.cleanup();
    }
  });
});
