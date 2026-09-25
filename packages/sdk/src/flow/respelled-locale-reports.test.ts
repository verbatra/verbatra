import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { contentHash } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { valueHash } from "../lock/provenance-file.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { check } from "./check.js";
import { diff } from "./diff.js";
import { lockState } from "./lock-state.js";

const config = baseConfig({ targetLocales: ["de", "pt-BR"] });

function hashOf(key: string, value: string): string {
  return contentHash({ key, namespace: "en", value, placeholders: [], isPlural: false });
}

async function respelledProject(stateLocale: string): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { a: "A new", b: "B" });
  await writeJsonFile(join(dir, "locales", "de.json"), { a: "Ad", b: "Bd" });
  await writeJsonFile(join(dir, "locales", "pt-BR.json"), { a: "Ap", b: "Bp" });
  await writeJsonFile(join(dir, "verbatra.lock.json"), {
    version: 1,
    locales: {
      de: { a: hashOf("a", "A new"), b: hashOf("b", "B") },
      [stateLocale]: { a: hashOf("a", "A old"), b: hashOf("b", "B") },
    },
  });
  await writeJsonFile(join(dir, "verbatra.provenance.json"), {
    version: 1,
    locales: { [stateLocale]: { a: { origin: "human", valueHash: valueHash("Ap") } } },
  });
  return dir;
}

async function stateFiles(dir: string): Promise<readonly string[]> {
  return Promise.all(
    ["verbatra.lock.json", "verbatra.provenance.json"].map((name) =>
      readFile(join(dir, name), "utf8"),
    ),
  );
}

describe("read-only reports: state recorded under a respelled locale", () => {
  it("check reads the underscore spelling as the configured locale and moves nothing", async () => {
    const dir = await respelledProject("pt_BR");
    const before = await stateFiles(dir);

    const summary = await check({ config, cwd: dir, locales: ["pt-BR"] });

    expect(summary.inSync).toBe(false);
    expect(summary.locales[0]).toMatchObject({
      locale: "pt-BR",
      stale: 1,
      upToDate: 1,
      protected: 1,
    });
    expect(summary.locales[0]?.provenance?.byOrigin.human).toBe(1);
    expect(await stateFiles(dir)).toEqual(before);
  });

  it("diff lists the stale key and its recorded origin under the configured locale", async () => {
    const dir = await respelledProject("pt_BR");

    const summary = await diff({ config, cwd: dir });

    expect(summary.hasPendingChanges).toBe(true);
    expect(summary.locales[1]).toMatchObject({
      locale: "pt-BR",
      changed: ["a"],
      changedOrigins: { a: "human" },
      protected: ["a"],
    });
  });

  it("lockState reports the carried baseline for the configured locale", async () => {
    const dir = await respelledProject("pt_BR");
    const before = await stateFiles(dir);

    const state = await lockState({ config, cwd: dir, locales: ["pt-BR"] });

    expect(state).toMatchObject({
      exists: true,
      locales: [{ locale: "pt-BR", keyCount: 2, stale: 1, upToDate: 1 }],
    });
    expect(await stateFiles(dir)).toEqual(before);
  });

  it("reads nothing across when two underscore spellings compete", async () => {
    const dir = await respelledProject("pt_BR");
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { pt_BR: { a: hashOf("a", "A old") }, pt_br: { a: hashOf("a", "A old") } },
    });

    const summary = await check({ config, cwd: dir, locales: ["pt-BR"] });

    expect(summary.locales[0]).toMatchObject({ stale: 0, upToDate: 2, inSync: true });
  });

  it("keeps a report working when the provenance file is corrupt", async () => {
    const dir = await respelledProject("pt_BR");
    await writeJsonFile(join(dir, "verbatra.provenance.json"), "not a provenance file");

    const summary = await check({ config, cwd: dir, locales: ["pt-BR"] });

    expect(summary.locales[0]).toMatchObject({ stale: 1 });
    expect(summary.locales[0]?.provenance).toBeUndefined();
  });
});
