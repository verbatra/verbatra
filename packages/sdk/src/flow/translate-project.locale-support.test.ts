import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import {
  baseConfig,
  makeFakeFs,
  makeStubProvider,
  makeTempDir,
  writeJsonFile,
} from "../test-support.js";
import { watch } from "../watch/watch.js";
import { retranslateEntry } from "./retranslate-entry.js";
import type { LocaleSummary } from "./summary.js";
import { translate } from "./translate-project.js";

async function project(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello" });
  return dir;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const deepl = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({
    provider: { id: "deepl", options: {} },
    targetLocales: ["de", "chr"],
    ...overrides,
  });

async function refusalOf(run: () => Promise<unknown>): Promise<SdkError> {
  const error = await run().then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof SdkError)) {
    throw new Error("expected an SdkError");
  }
  return error;
}

function noticeCodes(summary: LocaleSummary | undefined): readonly string[] {
  return summary?.notices.map((notice) => notice.code) ?? [];
}

describe("translate: a locale the provider does not support", () => {
  it("refuses the whole run before any provider is constructed or file is written", async () => {
    const dir = await project();
    const createProvider = vi.fn(() => makeStubProvider().provider);

    const error = await refusalOf(() =>
      translate({ config: deepl(), cwd: dir }, { createProvider }),
    );

    expect(error.code).toBe("LOCALE_UNSUPPORTED_BY_PROVIDER");
    expect(error.message).toContain('the target locale "chr" (sent as "CHR")');
    expect(createProvider).not.toHaveBeenCalled();
    expect(await exists(join(dir, "locales", "de.json"))).toBe(false);
    expect(await exists(join(dir, "verbatra.lock.json"))).toBe(false);
    expect(await exists(join(dir, ".verbatra-local", "run-status.json"))).toBe(false);
  });

  it.each([
    ["a dry run", { dryRun: true }],
    ["an estimate", { estimate: true }],
  ])(
    "refuses %s the same way, so a preview fails where the live run would",
    async (_label, flags) => {
      const dir = await project();

      const error = await refusalOf(() => translate({ config: deepl(), cwd: dir, ...flags }));

      expect(error.code).toBe("LOCALE_UNSUPPORTED_BY_PROVIDER");
    },
  );

  it("runs the supported locales when the unsupported one is left out of the run", async () => {
    const dir = await project();
    const stub = makeStubProvider();

    const summary = await translate(
      { config: deepl(), cwd: dir, locales: ["de"] },
      { createProvider: () => stub.provider },
    );

    expect(summary.succeeded).toEqual(["de"]);
  });

  it("refuses an unsupported source locale", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "chr.json"), { greeting: "Hello" });

    const error = await refusalOf(() =>
      translate({ config: deepl({ sourceLocale: "chr", targetLocales: ["de"] }), cwd: dir }),
    );

    expect(error.message).toContain('the source locale "chr"');
  });

  it("never refuses a locale under the provider none", async () => {
    const dir = await project();

    const summary = await translate({
      config: baseConfig({ provider: { id: "none", options: {} }, targetLocales: ["chr"] }),
      cwd: dir,
      dryRun: true,
    });

    expect(summary.locales.map((entry) => entry.locale)).toEqual(["chr"]);
    expect(noticeCodes(summary.locales[0])).toEqual([]);
  });
});

describe("translate: capability warnings", () => {
  it("reports a tone the provider cannot apply as a notice on that locale", async () => {
    const dir = await project();
    const stub = makeStubProvider();

    const summary = await translate(
      { config: deepl({ targetLocales: ["de", "sv"], tone: "formal" }), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(noticeCodes(summary.locales[0])).toEqual([]);
    expect(noticeCodes(summary.locales[1])).toEqual(["FORMALITY_UNSUPPORTED_BY_PROVIDER"]);
  });

  it("reports the same notices on a dry run", async () => {
    const dir = await project();

    const summary = await translate({
      config: baseConfig({ targetLocales: ["de", "sw"] }),
      cwd: dir,
      dryRun: true,
    });

    expect(noticeCodes(summary.locales[0])).toEqual([]);
    expect(noticeCodes(summary.locales[1])).toEqual(["LOCALE_NOT_WELL_TESTED"]);
  });
});

describe("watch and retranslateEntry: a locale the provider does not support", () => {
  it("refuses watch at startup, before anything is watched", async () => {
    const createWatcher = vi.fn();

    const error = await refusalOf(() =>
      watch(
        { config: deepl(), cwd: "/proj", onRun: () => undefined },
        { fs: makeFakeFs({ fileExists: async () => true }), createWatcher },
      ),
    );

    expect(error.code).toBe("LOCALE_UNSUPPORTED_BY_PROVIDER");
    expect(createWatcher).not.toHaveBeenCalled();
  });

  it("refuses retranslateEntry before the provider is constructed", async () => {
    const dir = await project();
    const createProvider = vi.fn(() => makeStubProvider().provider);

    const error = await refusalOf(() =>
      retranslateEntry(
        { config: deepl(), cwd: dir, locale: "chr", key: "greeting" },
        { createProvider },
      ),
    );

    expect(error.code).toBe("LOCALE_UNSUPPORTED_BY_PROVIDER");
    expect(createProvider).not.toHaveBeenCalled();
  });
});
