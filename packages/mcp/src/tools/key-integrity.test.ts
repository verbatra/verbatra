import { join } from "node:path";
import { LOCK_FILE_NAME } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { makeContext, makeProject, writeJsonFile } from "../test-support.js";
import { keyIntegrityTool } from "./key-integrity.js";

async function markStale(dir: string, locale: string, key: string): Promise<void> {
  await writeJsonFile(join(dir, LOCK_FILE_NAME), {
    version: 1,
    locales: { [locale]: { [key]: "stale-baseline-hash" } },
  });
}

describe("key.integrity", () => {
  it("reports a matching placeholder verdict for a correctly translated, changed key", async () => {
    const dir = await makeProject(
      { greeting: "Hello {{name}}" },
      { de: { greeting: "Hallo {{name}}" } },
    );
    await markStale(dir, "de", "greeting");

    const outcome = await keyIntegrityTool.execute({ key: "greeting" }, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: {
        locales: [{ locale: "de", hasPlaceholders: true, matches: true, missing: [], extra: [] }],
      },
    });
  });

  it("reports a missing placeholder when the translation dropped it", async () => {
    const dir = await makeProject({ greeting: "Hello {{name}}" }, { de: { greeting: "Hallo" } });
    await markStale(dir, "de", "greeting");

    const outcome = await keyIntegrityTool.execute({ key: "greeting" }, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { locales: [{ locale: "de", matches: false, missing: ["{{name}}"] }] },
    });
  });

  it("returns an empty locales list when the key has not been translated yet", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });

    const outcome = await keyIntegrityTool.execute({ key: "greeting" }, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({ kind: "ok", result: { locales: [] } });
  });

  it("returns an empty locales list for an already up-to-date, unchanged key", async () => {
    const dir = await makeProject(
      { greeting: "Hello {{name}}" },
      { de: { greeting: "Hallo {{name}}" } },
    );

    const outcome = await keyIntegrityTool.execute({ key: "greeting" }, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({ kind: "ok", result: { locales: [] } });
  });

  it("narrows the check to an explicit locales list", async () => {
    const dir = await makeProject(
      { greeting: "Hello {{name}}" },
      { de: { greeting: "Hallo {{name}}" } },
    );
    await markStale(dir, "de", "greeting");

    const outcome = await keyIntegrityTool.execute(
      { key: "greeting", locales: ["de"] },
      makeContext({ cwd: dir }),
    );

    expect(outcome).toMatchObject({ kind: "ok", result: { locales: [{ locale: "de" }] } });
  });

  it("rejects a blank key", async () => {
    const outcome = await keyIntegrityTool.execute({ key: "" }, makeContext());

    expect(outcome.kind).toBe("invalid");
  });
});
