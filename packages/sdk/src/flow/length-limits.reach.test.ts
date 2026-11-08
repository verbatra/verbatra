import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readWorkbook } from "@verbatra/exchange";
import { describe, expect, it } from "vitest";
import { LIMITS_FILE_NAME } from "../config/limits-file.js";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeStubProvider, makeTempDir, writeJsonFile } from "../test-support.js";
import { check } from "./check.js";
import { checkFile } from "./check-file.js";
import { keyContext } from "./key-context.js";
import { retranslateEntry } from "./retranslate-entry.js";
import { runSummarySchema } from "./summary-schema.js";
import { translate } from "./translate-project.js";
import { exportWorkbook } from "./workbook/export-workbook.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], format: "i18next-json", ...overrides });

async function project(
  source: Record<string, string>,
  target: Record<string, string> = {},
  limits?: string,
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  await writeJsonFile(join(dir, "locales", "de.json"), target);
  if (limits !== undefined) {
    await writeFile(join(dir, LIMITS_FILE_NAME), limits, "utf8");
  }
  return dir;
}

function limitsDocument(maxLength: Record<string, number>): string {
  return JSON.stringify({ version: 1, maxLength });
}

const SOURCE = { a: "Save your settings" };
const LONG_TARGET = { a: "Einstellungen sichern" };

describe("length limits: every read site reaches the limits file", () => {
  it("translate sends the sidecar-only limit to the provider", async () => {
    const dir = await project(SOURCE, {}, limitsDocument({ a: 7 }));
    const stub = makeStubProvider();

    await translate(
      { config: cfg(), cwd: dir, locales: ["de"] },
      { createProvider: () => stub.provider },
    );

    expect(stub.calls[0]?.request.maxLength?.get("a")).toBe(7);
  });

  it("retranslateEntry sends the sidecar-only limit to the provider", async () => {
    const dir = await project(SOURCE, LONG_TARGET, limitsDocument({ a: 7 }));
    const stub = makeStubProvider();

    await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "a" },
      { createProvider: () => stub.provider },
    );

    expect(stub.calls[0]?.request.maxLength?.get("a")).toBe(7);
  });

  it("check --qa flags a value over a sidecar-only limit", async () => {
    const dir = await project(SOURCE, LONG_TARGET, limitsDocument({ a: 10 }));

    const summary = await check({ config: cfg(), cwd: dir, qa: true });

    expect(summary.locales[0]?.qa?.findings).toContainEqual({
      key: "a",
      severity: "warning",
      reason: "MAX_LENGTH_EXCEEDED",
    });
  });

  it("checkFile flags a value over a sidecar-only limit", async () => {
    const dir = await project(SOURCE, LONG_TARGET, limitsDocument({ a: 10 }));

    const summary = await checkFile({ config: cfg(), cwd: dir, file: "locales/de.json" });

    expect(summary.locales[0]?.qa.findings).toContainEqual({
      key: "a",
      severity: "warning",
      reason: "MAX_LENGTH_EXCEEDED",
    });
  });

  it("exportWorkbook marks a current target over a sidecar-only limit", async () => {
    const dir = await project(SOURCE, LONG_TARGET, limitsDocument({ a: 10 }));

    const result = await exportWorkbook({ config: cfg(), cwd: dir, includeUnchanged: true });

    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    const row = data.sheets[0]?.rows.find((r) => r.key === "a");
    expect(row?.reviewReasons).toBe("max-length-exceeded");
  });

  it("keyContext reports a sidecar-only limit with its source", async () => {
    const dir = await project(SOURCE, LONG_TARGET, limitsDocument({ a: 10 }));

    const context = await keyContext({
      loaded: { config: cfg(), glossary: { source: "inline" } },
      cwd: dir,
      locale: "de",
      key: "a",
    });

    expect(context.maxLength).toBe(10);
    expect(context.maxLengthSource).toBe("limits-file");
    expect(context.limitsNotice).toBeUndefined();
  });
});

describe("length limits: the config wins per key", () => {
  it("holds a key set in both to the config value and says so", async () => {
    const dir = await project({ a: "Save", b: "Close" }, {}, limitsDocument({ a: 3, b: 4 }));
    const config = cfg({ maxLength: { a: 20 } });
    const stub = makeStubProvider();

    await translate({ config, cwd: dir, locales: ["de"] }, { createProvider: () => stub.provider });
    const context = await keyContext({
      loaded: { config, glossary: { source: "inline" } },
      cwd: dir,
      locale: "de",
      key: "a",
    });
    const other = await keyContext({
      loaded: { config, glossary: { source: "inline" } },
      cwd: dir,
      locale: "de",
      key: "b",
    });

    expect(stub.calls[0]?.request.maxLength?.get("a")).toBe(20);
    expect(stub.calls[0]?.request.maxLength?.get("b")).toBe(4);
    expect([context.maxLength, context.maxLengthSource]).toEqual([20, "config"]);
    expect([other.maxLength, other.maxLengthSource]).toEqual([4, "limits-file"]);
  });
});

describe("length limits: keys named like Object.prototype members", () => {
  const KEYS = ["constructor", "__proto__", "toString", "hasOwnProperty"];

  async function protoProject(limits?: string): Promise<string> {
    return project(Object.fromEntries(KEYS.map((key) => [key, "Hello there"])), {}, limits);
  }

  it.each(KEYS)("gives the key %s no limit when nothing sets one", async (key) => {
    const dir = await protoProject();

    const context = await keyContext({
      loaded: { config: cfg({ maxLength: { other: 5 } }), glossary: { source: "inline" } },
      cwd: dir,
      locale: "de",
      key,
    });

    expect(context.maxLength).toBeUndefined();
    expect(context.maxLengthSource).toBeUndefined();
    expect(Object.keys(context)).not.toContain("maxLength");
  });

  it.each(KEYS)("gives the key %s the limit the limits file sets for it", async (key) => {
    const dir = await protoProject(`{"version":1,"maxLength":{"${key}":9}}`);
    const stub = makeStubProvider();

    const context = await keyContext({
      loaded: { config: cfg(), glossary: { source: "inline" } },
      cwd: dir,
      locale: "de",
      key,
    });
    await translate(
      { config: cfg(), cwd: dir, locales: ["de"] },
      { createProvider: () => stub.provider },
    );

    expect([context.maxLength, context.maxLengthSource]).toEqual([9, "limits-file"]);
    expect(stub.calls[0]?.request.maxLength?.get(key)).toBe(9);
    for (const other of KEYS.filter((name) => name !== key)) {
      expect(stub.calls[0]?.request.maxLength?.get(other)).toBeUndefined();
    }
  });
});

describe("length limits: an unusable limits file", () => {
  const CORRUPT = "{ not json";

  it("raises LIMITS_FILE_IGNORED on every locale of a run and still translates", async () => {
    const dir = await project(SOURCE, {}, CORRUPT);
    const stub = makeStubProvider();

    const summary = await translate(
      { config: cfg({ targetLocales: ["de", "fr"] }), cwd: dir, locales: ["de", "fr"] },
      { createProvider: () => stub.provider },
    );

    expect(summary.failed).toEqual([]);
    for (const locale of summary.locales) {
      expect(locale.notices.map((notice) => notice.code)).toContain("LIMITS_FILE_IGNORED");
    }
    expect(stub.calls[0]?.request.maxLength).toBeUndefined();
  });

  it("raises the notice on a dry run and leaves the file as it was", async () => {
    const dir = await project(SOURCE, {}, CORRUPT);

    const summary = await translate({ config: cfg(), cwd: dir, dryRun: true });

    expect(summary.locales[0]?.notices.map((notice) => notice.code)).toContain(
      "LIMITS_FILE_IGNORED",
    );
    expect(await readFile(join(dir, LIMITS_FILE_NAME), "utf8")).toBe(CORRUPT);
  });

  it("raises nothing for an absent file", async () => {
    const dir = await project(SOURCE);

    const summary = await translate({ config: cfg(), cwd: dir, dryRun: true });

    expect(summary.locales[0]?.notices.map((notice) => notice.code)).not.toContain(
      "LIMITS_FILE_IGNORED",
    );
  });

  it("does not throw from keyContext, check, export or retranslate, and keyContext says why", async () => {
    const dir = await project(SOURCE, LONG_TARGET, CORRUPT);
    const stub = makeStubProvider();

    const context = await keyContext({
      loaded: { config: cfg(), glossary: { source: "inline" } },
      cwd: dir,
      locale: "de",
      key: "a",
    });
    await check({ config: cfg(), cwd: dir, qa: true });
    await checkFile({ config: cfg(), cwd: dir, file: "locales/de.json" });
    await exportWorkbook({ config: cfg(), cwd: dir, includeUnchanged: true });
    await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "a" },
      { createProvider: () => stub.provider },
    );

    expect(context.limitsNotice?.code).toBe("LIMITS_FILE_IGNORED");
    expect(context.limitsNotice?.message).toContain("not valid JSON");
    expect(context.maxLength).toBeUndefined();
  });

  it("falls back to the config limits for a key the config sets", async () => {
    const dir = await project(SOURCE, {}, CORRUPT);
    const stub = makeStubProvider();

    await translate(
      { config: cfg({ maxLength: { a: 12 } }), cwd: dir, locales: ["de"] },
      { createProvider: () => stub.provider },
    );

    expect(stub.calls[0]?.request.maxLength?.get("a")).toBe(12);
  });
});

describe("length limits: the published run summary schema", () => {
  it("accepts a real summary that carries LIMITS_FILE_IGNORED", async () => {
    const dir = await project(SOURCE, {}, "{ not json");

    const summary = await translate({ config: cfg(), cwd: dir, dryRun: true });

    expect(summary.locales[0]?.notices.map((notice) => notice.code)).toContain(
      "LIMITS_FILE_IGNORED",
    );
    expect(runSummarySchema.safeParse(summary).success).toBe(true);
  });
});
