import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDefaultRegistry, type LoadedConfig } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { localeIntegrityHandler } from "./locale-integrity.js";

function deps(project: FixtureProject, extra: Partial<RpcHandlerDeps> = {}): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: project.config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: project.root, ...extra };
}

async function writeJson(project: FixtureProject, path: string, value: unknown): Promise<void> {
  await writeFile(join(project.root, path), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function driftedProject(): Promise<FixtureProject> {
  const project = await makeFixtureProject(
    { targetLocales: ["de", "fr"] },
    { greeting: "Hello {{name}}", title: "Title", intact: "Same" },
  );
  await writeJson(project, "locales/de.json", {
    greeting: "Hallo",
    title: "Titel",
    intact: "Gleich",
  });
  await writeJson(project, "locales/fr.json", { greeting: "Bonjour {{name}}" });
  await writeJson(project, "verbatra.lock.json", {
    version: 1,
    locales: {
      de: { greeting: "old", title: "old" },
      fr: { greeting: "old" },
    },
  });
  return project;
}

describe("localeIntegrityHandler", () => {
  it("reports only failing keys, in sync or not, per locale", async () => {
    const project = await driftedProject();
    try {
      const result = await localeIntegrityHandler({}, deps(project));

      expect(result.locales.map((locale) => locale.locale)).toEqual(["de", "fr"]);
      const de = result.locales[0]?.entries ?? [];
      expect(de.map((entry) => [entry.key, entry.matches])).toEqual([["greeting", false]]);
      expect(de[0]?.missing).toEqual(["{{name}}"]);
      expect(result.locales[1]?.entries).toEqual([]);
    } finally {
      await project.cleanup();
    }
  });

  it("finds a broken translation whose key is in sync", async () => {
    const project = await makeFixtureProject(
      { targetLocales: ["de"] },
      { total: "Total: {{amount}}" },
    );
    try {
      await writeJson(project, "locales/de.json", { total: "Summe: {{betrag}}" });
      const result = await localeIntegrityHandler({}, deps(project));

      expect(result.locales[0]?.entries).toEqual([
        expect.objectContaining({ key: "total", missing: ["{{amount}}"], extra: ["{{betrag}}"] }),
      ]);
    } finally {
      await project.cleanup();
    }
  });

  it("narrows the report to the requested locales and passes the adapter registry on", async () => {
    const project = await driftedProject();
    try {
      const result = await localeIntegrityHandler(
        { locales: ["fr"] },
        deps(project, { adapterRegistry: createDefaultRegistry() }),
      );

      expect(result.locales.map((locale) => locale.locale)).toEqual(["fr"]);
    } finally {
      await project.cleanup();
    }
  });

  it("surfaces an unknown locale as UNKNOWN_LOCALE", async () => {
    const project = await driftedProject();
    try {
      await expect(
        localeIntegrityHandler({ locales: ["xx"] }, deps(project)),
      ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
    } finally {
      await project.cleanup();
    }
  });
});
