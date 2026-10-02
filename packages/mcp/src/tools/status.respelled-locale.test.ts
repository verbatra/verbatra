import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LOCK_FILE_NAME } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  makeContext,
  makeProject,
  writeJsonFile,
} from "../test-support.js";
import { lockStateTool } from "./lock-state.js";
import { statusCheckTool } from "./status-check.js";
import { statusDiffTool } from "./status-diff.js";

async function respelledProject(): Promise<string> {
  const dir = await makeProject({ a: "A new", b: "B" }, { "pt-BR": { a: "Ap", b: "Bp" } });
  await writeJsonFile(join(dir, LOCK_FILE_NAME), {
    version: 1,
    locales: { pt_BR: { a: "0000000000000000" } },
  });
  return dir;
}

function contextFor(cwd: string) {
  return makeContext({
    cwd,
    config: baseLoadedConfig({ config: baseVerbatraConfig({ targetLocales: ["pt-BR"] }) }),
  });
}

describe("read tools: state recorded under a respelled locale", () => {
  it("status.check reports the stale key and leaves the lock file alone", async () => {
    const dir = await respelledProject();
    const before = await readFile(join(dir, LOCK_FILE_NAME), "utf8");

    const outcome = await statusCheckTool.execute({}, contextFor(dir));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { inSync: false, locales: [{ locale: "pt-BR", stale: 1, inSync: false }] },
    });
    expect(await readFile(join(dir, LOCK_FILE_NAME), "utf8")).toBe(before);
  });

  it("status.diff names the key a run would re-translate", async () => {
    const dir = await respelledProject();

    const outcome = await statusDiffTool.execute({}, contextFor(dir));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { hasPendingChanges: true, locales: [{ locale: "pt-BR", changed: ["a"] }] },
    });
  });

  it("lock.state reports the baseline recorded under the underscore spelling", async () => {
    const dir = await respelledProject();

    const outcome = await lockStateTool.execute({}, contextFor(dir));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { exists: true, locales: [{ locale: "pt-BR", keyCount: 1, stale: 1 }] },
    });
  });
});
