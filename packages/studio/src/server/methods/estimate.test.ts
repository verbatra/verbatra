import { readdir } from "node:fs/promises";
import type { LoadedConfig } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { estimateHandler } from "./estimate.js";

function deps(project: FixtureProject, factoryCalls: string[]): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return {
    config: loaded,
    projectRoot: project.root,
    createProvider: (config) => {
      factoryCalls.push(config.id);
      throw new Error("an estimate must never construct a provider");
    },
  };
}

describe("estimateHandler", () => {
  it("returns a dry-run summary carrying the estimate, constructing no provider and writing nothing", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de", "fr"] },
      { greeting: "hello", farewell: "bye" },
    );
    const factoryCalls: string[] = [];
    try {
      const result = await estimateHandler({}, deps(project, factoryCalls));

      expect(result.dryRun).toBe(true);
      expect(result.estimate).toMatchObject({
        keys: 4,
        locales: [
          { locale: "de", keys: 2 },
          { locale: "fr", keys: 2 },
        ],
      });
      expect(factoryCalls).toEqual([]);
      expect(await readdir(`${project.root}/locales`)).toEqual(["en.json"]);
      expect(await readdir(project.root)).toEqual(["locales"]);
    } finally {
      await project.cleanup();
    }
  });

  it("narrows the estimate to the named locales", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de", "fr"] },
      { greeting: "hello" },
    );
    try {
      const result = await estimateHandler({ locales: ["de"] }, deps(project, []));

      expect(result.estimate?.locales.map((locale) => locale.locale)).toEqual(["de"]);
    } finally {
      await project.cleanup();
    }
  });

  it("refuses a locale that is not a configured target", async () => {
    const project = await makeFixtureProject({ targetLocales: ["de"] }, { greeting: "hello" });
    try {
      await expect(estimateHandler({ locales: ["xx"] }, deps(project, []))).rejects.toMatchObject({
        code: "UNKNOWN_LOCALE",
      });
    } finally {
      await project.cleanup();
    }
  });
});
