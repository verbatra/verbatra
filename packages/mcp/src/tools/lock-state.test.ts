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
import { lockStateTool } from "./lock-state.js";

describe("lock.state", () => {
  it("reports exists: false when no lock file has been written yet", async () => {
    const dir = await makeProject({ greeting: "Hello" });

    const outcome = await lockStateTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toEqual({
      kind: "ok",
      result: { exists: false },
      structuredContent: { exists: false },
    });
  });

  it("reports the lock file's version and per-locale baseline size once one exists", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    await writeJsonFile(join(dir, LOCK_FILE_NAME), { version: 1, locales: { de: {} } });

    const outcome = await lockStateTool.execute({}, makeContext({ cwd: dir }));

    expect(outcome).toMatchObject({
      kind: "ok",
      result: { exists: true, version: 1, locales: [{ locale: "de", keyCount: 0 }] },
    });
  });

  it("rejects an unrecognized parameter", async () => {
    const outcome = await lockStateTool.execute({ bogus: true }, makeContext());

    expect(outcome.kind).toBe("invalid");
  });

  it("uses an injected fs to check for the lock file rather than the real filesystem", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    const { fs, counts } = trackFsCalls();

    const outcome = await lockStateTool.execute(
      {},
      makeContext({ cwd: dir, fs, adapterRegistry: defaultAdapterRegistry }),
    );

    expect(outcome).toMatchObject({ kind: "ok", result: { exists: false } });
    expect(counts.fileExists).toBeGreaterThan(0);
  });

  it("uses an injected adapter registry to resolve the configured format", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: {} });
    await writeJsonFile(join(dir, LOCK_FILE_NAME), { version: 1, locales: { de: {} } });
    const { adapterRegistry, counts } = trackAdapterRegistryCalls();

    const outcome = await lockStateTool.execute(
      {},
      makeContext({ cwd: dir, fs: nodeFs, adapterRegistry }),
    );

    expect(outcome).toMatchObject({ kind: "ok", result: { exists: true } });
    expect(counts.resolveCalls).toBeGreaterThan(0);
  });
});
