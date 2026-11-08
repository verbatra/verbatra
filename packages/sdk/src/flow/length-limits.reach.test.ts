import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readWorkbook } from "@verbatra/exchange";
import { describe, expect, it } from "vitest";
import { LIMITS_FILE_NAME } from "../config/limits-file.js";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeStubProvider, makeTempDir, writeJsonFile } from "../test-support.js";
import { check } from "./check.js";
import { checkFile } from "./check-file.js";
import { checkFileSummarySchema } from "./check-file-schema.js";
import { checkSummarySchema } from "./check-schema.js";
import { keyContext } from "./key-context.js";
import { retranslateEntry } from "./retranslate-entry.js";
import { runSummarySchema } from "./summary-schema.js";
import { translate } from "./translate-project.js";
import { exportWorkbook } from "./workbook/export-workbook.js";
import { exportWorkbookResultSchema } from "./workbook/export-workbook-schema.js";

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

describe("length limits: generated plural forms are measured against their own key only", () => {
  const SOURCE_PLURAL = { items_one: "One item", items_other: "Many items" };
  const POLISH = {
    items_one: "Jeden element tutaj",
    items_few: "Kilka elementow tutaj",
    items_many: "Wiele elementow tutaj",
    items_other: "Inne elementy tutaj",
  };
  const plural = (maxLength: Record<string, number>) => cfg({ targetLocales: ["pl"], maxLength });

  async function exceeded(limits: Record<string, number>, sidecar: boolean): Promise<string[]> {
    const dir = await project(SOURCE_PLURAL, {}, sidecar ? limitsDocument(limits) : undefined);
    await writeJsonFile(join(dir, "locales", "pl.json"), POLISH);
    const config = plural(sidecar ? {} : limits);
    const summary = await check({ config, cwd: dir, qa: true });
    return (summary.locales[0]?.qa?.findings ?? [])
      .filter((finding) => finding.reason === "MAX_LENGTH_EXCEEDED")
      .map((finding) => finding.key)
      .sort();
  }

  it.each([
    ["config", false],
    ["limits file", true],
  ])(
    "a limit on the governing key (%s) does not reach the generated forms",
    async (_label, sidecar) => {
      expect(await exceeded({ items_other: 3 }, sidecar)).toEqual(["items_other"]);
    },
  );

  it.each([
    ["config", false],
    ["limits file", true],
  ])("a limit on a generated form's own key (%s) applies to it", async (_label, sidecar) => {
    expect(await exceeded({ items_few: 3 }, sidecar)).toEqual(["items_few"]);
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

  it("returns the notice from keyContext, with the reason", async () => {
    const dir = await project(SOURCE, LONG_TARGET, CORRUPT);

    const context = await keyContext({
      loaded: { config: cfg(), glossary: { source: "inline" } },
      cwd: dir,
      locale: "de",
      key: "a",
    });

    expect(context.limitsNotice?.code).toBe("LIMITS_FILE_IGNORED");
    expect(context.limitsNotice?.message).toContain("not valid JSON");
    expect(context.maxLength).toBeUndefined();
  });

  it("returns the notice from check --qa, and none without qa or for a usable file", async () => {
    const dir = await project(SOURCE, LONG_TARGET, CORRUPT);
    const usable = await project(SOURCE, LONG_TARGET, limitsDocument({ a: 99 }));

    const withQa = await check({ config: cfg(), cwd: dir, qa: true });
    const withoutQa = await check({ config: cfg(), cwd: dir });
    const fine = await check({ config: cfg(), cwd: usable, qa: true });

    expect(withQa.qa?.limitsNotice).toEqual({
      code: "LIMITS_FILE_IGNORED",
      message: expect.stringContaining("not valid JSON"),
    });
    expect(withoutQa.qa).toBeUndefined();
    expect(fine.qa?.limitsNotice).toBeUndefined();
    expect(checkSummarySchema.parse(withQa).qa?.limitsNotice).toEqual(withQa.qa?.limitsNotice);
  });

  it("returns the notice from checkFile for a target, a source and a usable file", async () => {
    const dir = await project(SOURCE, LONG_TARGET, CORRUPT);
    const usable = await project(SOURCE, LONG_TARGET, limitsDocument({ a: 99 }));

    const target = await checkFile({ config: cfg(), cwd: dir, file: "locales/de.json" });
    const source = await checkFile({ config: cfg(), cwd: dir, file: "locales/en.json" });
    const fine = await checkFile({ config: cfg(), cwd: usable, file: "locales/de.json" });

    expect(target.qa.limitsNotice?.code).toBe("LIMITS_FILE_IGNORED");
    expect(source.qa.limitsNotice?.code).toBe("LIMITS_FILE_IGNORED");
    expect(fine.qa.limitsNotice).toBeUndefined();
    expect(checkFileSummarySchema.parse(target).qa.limitsNotice).toEqual(target.qa.limitsNotice);
  });

  it("returns the notice from exportWorkbook, valid under the published schema", async () => {
    const dir = await project(SOURCE, LONG_TARGET, CORRUPT);
    const usable = await project(SOURCE, LONG_TARGET, limitsDocument({ a: 99 }));

    const result = await exportWorkbook({ config: cfg(), cwd: dir, includeUnchanged: true });
    const fine = await exportWorkbook({ config: cfg(), cwd: usable, includeUnchanged: true });

    expect(result.limitsNotice?.code).toBe("LIMITS_FILE_IGNORED");
    expect(fine.limitsNotice).toBeUndefined();
    expect(exportWorkbookResultSchema.parse(result).limitsNotice).toEqual(result.limitsNotice);
  });

  it("returns the notice from retranslateEntry on an accepted and on a refused value", async () => {
    const dir = await project(SOURCE, LONG_TARGET, CORRUPT);
    const refusing = await project(SOURCE, LONG_TARGET, CORRUPT);
    const accepting = makeStubProvider();
    const refused = makeStubProvider({ failIntegrity: new Set(["a"]) });

    const ok = await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "a" },
      { createProvider: () => accepting.provider },
    );
    const bad = await retranslateEntry(
      { config: cfg(), cwd: refusing, locale: "de", key: "a" },
      { createProvider: () => refused.provider },
    );

    expect(ok.accepted).toBe(true);
    expect(ok.limitsNotice?.code).toBe("LIMITS_FILE_IGNORED");
    expect(bad.accepted).toBe(false);
    expect(bad.limitsNotice?.code).toBe("LIMITS_FILE_IGNORED");
  });

  it("returns no notice from retranslateEntry for a usable file", async () => {
    const dir = await project(SOURCE, LONG_TARGET, limitsDocument({ a: 99 }));
    const stub = makeStubProvider();

    const result = await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "a" },
      { createProvider: () => stub.provider },
    );

    expect(result.limitsNotice).toBeUndefined();
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
