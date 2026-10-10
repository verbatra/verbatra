import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  defaultAdapterRegistry,
  makeContext,
  makeProject,
  makeStubProvider,
  nodeFs,
  writeJsonFile,
} from "../test-support.js";
import type { RegisteredMcpTool } from "./define-tool.js";
import { editEntryTool } from "./edit-entry.js";
import { glossaryWriteTool } from "./glossary.js";
import { keyIntegrityTool } from "./key-integrity.js";
import {
  DEFAULT_LOCK_TIMEOUT_MS,
  lockAcquireTimeoutMs,
  MAX_LOCK_TIMEOUT_MS,
} from "./lock-timeout.js";
import { retranslateEntryTool } from "./retranslate-entry.js";
import { translatePendingTool } from "./translate-pending.js";

async function holdLock(dir: string, stem: string): Promise<void> {
  await mkdir(join(dir, ".verbatra-local", "locks"), { recursive: true });
  await writeFile(
    join(dir, ".verbatra-local", "locks", `${stem}.lock`),
    JSON.stringify({ pid: 999_999, acquiredAt: "2026-07-18T00:00:00.000Z" }),
    "utf8",
  );
}

async function contendedProject(stem: string) {
  const dir = await makeProject({ greeting: "Hello" }, { de: { greeting: "Hallo" } });
  const glossaryPath = join(dir, "glossary.json");
  await writeJsonFile(glossaryPath, { Save: "Speichern" });
  await holdLock(dir, stem);
  const context = makeContext({
    config: baseLoadedConfig({
      config: baseVerbatraConfig(),
      glossary: { source: "file", path: glossaryPath },
    }),
    cwd: dir,
    fs: nodeFs,
    adapterRegistry: defaultAdapterRegistry,
    createProvider: () => makeStubProvider(),
  });
  return { dir, context };
}

const WRITE_TOOLS: readonly [string, RegisteredMcpTool, string, Record<string, unknown>][] = [
  [editEntryTool.name, editEntryTool, "de", { locale: "de", key: "greeting", value: "Servus" }],
  [retranslateEntryTool.name, retranslateEntryTool, "de", { locale: "de", key: "greeting" }],
  [glossaryWriteTool.name, glossaryWriteTool, "_glossary", { term: "Open", translation: "Öffnen" }],
];

describe("write tools: lockTimeoutMs", () => {
  it("defaults to 30 seconds and passes an explicit value through", () => {
    expect(DEFAULT_LOCK_TIMEOUT_MS).toBe(30_000);
    expect(lockAcquireTimeoutMs(undefined)).toBe(30_000);
    expect(lockAcquireTimeoutMs(0)).toBe(0);
  });

  it.each(WRITE_TOOLS)(
    "%s fails with LOCK_CONTENDED at once under lockTimeoutMs 0 and writes nothing",
    async (_name, tool, stem, params) => {
      const { dir, context } = await contendedProject(stem);
      const before = await readFile(join(dir, "locales", "de.json"), "utf8");

      const outcome = await tool.execute({ ...params, lockTimeoutMs: 0 }, context);

      expect(outcome).toMatchObject({
        kind: "error",
        message: expect.stringMatching(/^LOCK_CONTENDED: /),
      });
      expect(await readFile(join(dir, "locales", "de.json"), "utf8")).toBe(before);
    },
  );

  it("fails only the contended locale of translation.translatePending under lockTimeoutMs 0", async () => {
    const { context } = await contendedProject("de");

    const outcome = await translatePendingTool.execute({ lockTimeoutMs: 0 }, context);

    expect(outcome.kind).toBe("ok");
    const result = (outcome as { readonly result: { readonly failed: readonly string[] } }).result;
    expect(result.failed).toEqual(["de"]);
  });

  it("states the bounds translation.translatePending accepts from the shared constants", () => {
    expect(translatePendingTool.description).toContain(
      `lockTimeoutMs parameter, 0 to ${MAX_LOCK_TIMEOUT_MS} milliseconds and ${DEFAULT_LOCK_TIMEOUT_MS} by default`,
    );
  });

  it.each([[-1], [1.5], [600_001]])(
    "refuses lockTimeoutMs %s as invalid input",
    async (lockTimeoutMs) => {
      const { context } = await contendedProject("de");

      const outcome = await editEntryTool.execute(
        { locale: "de", key: "greeting", value: "Servus", lockTimeoutMs },
        context,
      );

      expect(outcome.kind).toBe("invalid");
    },
  );
});

describe("key.integrity: an unknown key", () => {
  it("fails with UNKNOWN_KEY instead of returning empty rows", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: { greeting: "Hallo" } });

    const outcome = await keyIntegrityTool.execute(
      { key: "nope" },
      makeContext({ cwd: dir, fs: nodeFs, adapterRegistry: defaultAdapterRegistry }),
    );

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringMatching(/^UNKNOWN_KEY: /),
    });
  });

  it("still reports a known key with the locales narrowed", async () => {
    const dir = await makeProject({ greeting: "Hello" }, { de: { greeting: "Hallo" } });

    const outcome = await keyIntegrityTool.execute(
      { key: "greeting", locales: ["de"] },
      makeContext({ cwd: dir, fs: nodeFs, adapterRegistry: defaultAdapterRegistry }),
    );

    expect(outcome).toEqual({ kind: "ok", result: { locales: [{ locale: "de", entries: [] }] } });
  });
});
