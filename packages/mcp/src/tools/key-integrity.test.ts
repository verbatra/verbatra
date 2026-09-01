import { join } from "node:path";
import { LOCK_FILE_NAME } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  defaultAdapterRegistry,
  makeContext,
  makeProject,
  nodeFs,
  trackAdapterRegistryCalls,
  trackFsCalls,
  writeJsonFile,
} from "../test-support.js";
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
        locales: [
          {
            locale: "de",
            entries: [{ hasPlaceholders: true, matches: true, missing: [], extra: [] }],
          },
        ],
      },
    });
  });

  it("reports a missing placeholder when the translation dropped it", async () => {
    const dir = await makeProject({ greeting: "Hello {{name}}" }, { de: { greeting: "Hallo" } });
    await markStale(dir, "de", "greeting");

    const outcome = await keyIntegrityTool.execute({ key: "greeting" }, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { locales: [{ locale: "de", entries: [{ matches: false, missing: ["{{name}}"] }] }] },
    });
  });

  it("keeps a checked locale row with an empty entries array when the key has not been translated yet", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });

    const outcome = await keyIntegrityTool.execute({ key: "greeting" }, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { locales: [{ locale: "de", entries: [] }] },
    });
  });

  it("keeps a checked locale row with an empty entries array for an already up-to-date, unchanged key", async () => {
    const dir = await makeProject(
      { greeting: "Hello {{name}}" },
      { de: { greeting: "Hallo {{name}}" } },
    );

    const outcome = await keyIntegrityTool.execute({ key: "greeting" }, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { locales: [{ locale: "de", entries: [] }] },
    });
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

  it("uses an injected fs to read the lock file and locale files rather than the real filesystem", async () => {
    const dir = await makeProject(
      { greeting: "Hello {{name}}" },
      { de: { greeting: "Hallo {{name}}" } },
    );
    await markStale(dir, "de", "greeting");
    const { fs, counts } = trackFsCalls();

    const outcome = await keyIntegrityTool.execute(
      { key: "greeting" },
      makeContext({ cwd: dir, fs, adapterRegistry: defaultAdapterRegistry }),
    );

    expect(outcome).toMatchObject({ kind: "ok" });
    expect(counts.readFileBounded).toBeGreaterThan(0);
  });

  it("uses an injected adapter registry to resolve the configured format", async () => {
    const dir = await makeProject(
      { greeting: "Hello {{name}}" },
      { de: { greeting: "Hallo {{name}}" } },
    );
    await markStale(dir, "de", "greeting");
    const { adapterRegistry, counts } = trackAdapterRegistryCalls();

    const outcome = await keyIntegrityTool.execute(
      { key: "greeting" },
      makeContext({ cwd: dir, fs: nodeFs, adapterRegistry }),
    );

    expect(outcome).toMatchObject({ kind: "ok" });
    expect(counts.resolveCalls).toBeGreaterThan(0);
  });

  it("describes itself as reporting only source drift since the lock baseline, not general verification", () => {
    expect(keyIntegrityTool.description).toContain("changed since");
    expect(keyIntegrityTool.description).not.toContain("verify a specific key");
  });
});
