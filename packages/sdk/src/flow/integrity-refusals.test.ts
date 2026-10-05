import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeStubProvider, makeTempDir, writeJsonFile } from "../test-support.js";
import { translate } from "./translate-project.js";

async function project(source: Record<string, string>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  return dir;
}

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], ...overrides });

describe("translate: integrity refusal reasons", () => {
  it("names the reason and the offending placeholder for each refused key", async () => {
    const dir = await project({ a: "A", b: "B" });
    const stub = makeStubProvider({ failIntegrity: new Set(["a"]) });

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(summary.locales[0]?.integrityRefusals).toEqual([
      { key: "a", reason: "placeholder", details: ["+{{__stub_integrity_fail__}}"] },
    ]);
  });

  it("carries the representative's reason to a key sharing its source text", async () => {
    const dir = await project({ a: "Same", b: "Same", c: "Other" });
    const stub = makeStubProvider({ failIntegrity: new Set(["a"]) });

    const summary = await translate(
      { config: cfg(), cwd: dir },
      { createProvider: () => stub.provider },
    );

    const refusals = summary.locales[0]?.integrityRefusals ?? [];
    expect(refusals.map((refusal) => refusal.key)).toEqual(["a", "b"]);
    expect(new Set(refusals.map((refusal) => refusal.reason))).toEqual(new Set(["placeholder"]));
  });

  it("names each wrong ICU plural arm for a translation that keeps the English arms in Russian", async () => {
    const dir = await project({ files: "{n, plural, one {# file} other {# files}}" });
    const stub = makeStubProvider({ translate: (value) => value });

    const summary = await translate(
      { config: cfg({ targetLocales: ["ru"], format: "next-intl-json" }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(summary.locales[0]?.integrityRefusals).toEqual([
      {
        key: "files",
        reason: "icu",
        details: [
          '{n} plural: missing arm "few" required by the target language',
          '{n} plural: missing arm "many" required by the target language',
        ],
      },
    ]);
  });

  it("reports no refusal on a dry run", async () => {
    const dir = await project({ a: "A" });
    const stub = makeStubProvider({ failIntegrity: new Set(["a"]) });

    const summary = await translate(
      { config: cfg(), cwd: dir, dryRun: true },
      { createProvider: () => stub.provider },
    );

    expect(summary.locales[0]?.integrityRefusals).toEqual([]);
  });
});
