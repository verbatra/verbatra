import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs } from "../fs.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { translate } from "./translate-project.js";

const KEY_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "DEEPL_API_KEY",
  "GOOGLE_TRANSLATE_API_KEY",
];

async function project(source: Record<string, unknown>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  return dir;
}

function anthropicConfig(overrides: Partial<VerbatraConfig> = {}): VerbatraConfig {
  return baseConfig({
    targetLocales: ["de", "fr"],
    provider: { id: "anthropic", options: { model: "sonnet-test", maxTokens: 4096 } },
    ...overrides,
  });
}

async function withoutProviderKeys<T>(run: () => Promise<T>): Promise<T> {
  const saved = KEY_ENV_VARS.map((name) => [name, process.env[name]] as const);
  for (const name of KEY_ENV_VARS) {
    delete process.env[name];
  }
  try {
    return await run();
  } finally {
    for (const [name, value] of saved) {
      if (value !== undefined) {
        process.env[name] = value;
      }
    }
  }
}

describe("translate: an estimate spends nothing", () => {
  it("constructs no provider and reads no API key, even without an explicit dry run", async () => {
    const dir = await project({ greeting: "Hello world" });
    let providerConstructions = 0;

    const summary = await withoutProviderKeys(() =>
      translate(
        { config: anthropicConfig(), cwd: dir, estimate: true },
        {
          createProvider: () => {
            providerConstructions += 1;
            throw new Error("a pre-run estimate must never construct a provider");
          },
        },
      ),
    );

    expect(providerConstructions).toBe(0);
    expect(summary.dryRun).toBe(true);
    expect(summary.estimate).toBeDefined();
  });

  it("writes no locale file, no lock file, no cache, and no run-status record", async () => {
    const dir = await project({ greeting: "Hello world" });
    const written: string[] = [];

    await withoutProviderKeys(() =>
      translate(
        { config: anthropicConfig(), cwd: dir, estimate: true },
        {
          fs: {
            ...defaultFs,
            writeFile: async (path: string, contents: string) => {
              written.push(path);
              await defaultFs.writeFile(path, contents);
            },
            writeBytes: async (path: string, bytes: Uint8Array) => {
              written.push(path);
              await defaultFs.writeBytes(path, bytes);
            },
            createExclusive: async (path: string, contents: string) => {
              written.push(path);
              return defaultFs.createExclusive(path, contents);
            },
            deleteFile: async (path: string) => {
              written.push(path);
              await defaultFs.deleteFile(path);
            },
            mkdir: async (path: string) => {
              written.push(path);
              await defaultFs.mkdir?.(path);
            },
          },
        },
      ),
    );

    expect(written).toEqual([]);
  });

  it("keeps an explicit dry run estimate-free unless an estimate was asked for", async () => {
    const dir = await project({ greeting: "Hello world" });

    const summary = await withoutProviderKeys(() =>
      translate({ config: anthropicConfig(), cwd: dir, dryRun: true }),
    );

    expect(summary.estimate).toBeUndefined();
  });
});

describe("translate: what the estimate covers", () => {
  it("estimates exactly the keys the dry run reports as translatable, per locale", async () => {
    const dir = await project({ greeting: "Hello world", farewell: "Goodbye" });

    const summary = await withoutProviderKeys(() =>
      translate({ config: anthropicConfig(), cwd: dir, estimate: true }),
    );

    expect(summary.estimate?.locales.map((locale) => locale.locale)).toEqual(["de", "fr"]);
    expect(summary.estimate?.keys).toBe(4);
    expect(summary.estimate?.requests).toBe(2);
  });

  it("splits a locale into one request per configured batch, not per key", async () => {
    const source = Object.fromEntries(
      Array.from({ length: 5 }, (_, index) => [`k${index}`, "value"]),
    );
    const dir = await project(source);

    const summary = await withoutProviderKeys(() =>
      translate({
        config: anthropicConfig({ targetLocales: ["de"], maxBatchSize: 2 }),
        cwd: dir,
        estimate: true,
      }),
    );

    expect(summary.estimate?.requests).toBe(3);
  });

  it("prices the run from the rate card the config carries", async () => {
    const dir = await project({ greeting: "Hello world" });

    const summary = await withoutProviderKeys(() =>
      translate({
        config: anthropicConfig({
          targetLocales: ["de"],
          rates: {
            asOf: "2026-01-15",
            currency: "USD",
            table: {
              "anthropic/sonnet-test": {
                inputPerMillionTokens: 3,
                outputPerMillionTokens: 15,
              },
            },
          },
        }),
        cwd: dir,
        estimate: true,
      }),
    );

    expect(summary.estimate?.pricing).toBe("priced");
    expect(summary.estimate?.currency).toBe("USD");
    expect(summary.estimate?.asOf).toBe("2026-01-15");
    expect(summary.estimate?.cost).toBeGreaterThan(0);
  });

  it("leaves invalid-ICU keys out of the estimate, because they are never sent", async () => {
    const dir = await project({ good: "Hello", broken: "{count, plural, one {x}" });

    const summary = await withoutProviderKeys(() =>
      translate({
        config: anthropicConfig({ targetLocales: ["de"], format: "next-intl-json" }),
        cwd: dir,
        estimate: true,
      }),
    );

    expect(summary.locales[0]?.invalidIcuSource).toEqual(["broken"]);
    expect(summary.estimate?.keys).toBe(1);
  });
});

describe("translate: the estimate path is proven keyless, not merely key-free", () => {
  it("fails a live run without a key, which is what makes the estimate's success meaningful", async () => {
    const dir = await project({ greeting: "Hello world" });

    await expect(
      withoutProviderKeys(() => translate({ config: anthropicConfig(), cwd: dir })),
    ).rejects.toMatchObject({ code: "PROVIDER_CONSTRUCTION_FAILED" });
  });

  it("completes an estimate through the real provider factory with every key removed", async () => {
    const dir = await project({ greeting: "Hello world" });

    const summary = await withoutProviderKeys(() =>
      translate({ config: anthropicConfig(), cwd: dir, estimate: true }),
    );

    expect(summary.estimate?.provider).toBe("anthropic");
    expect(summary.dryRun).toBe(true);
  });

  it("overrides an explicit dryRun:false, so an estimate can never be asked to run live", async () => {
    const dir = await project({ greeting: "Hello world" });

    const summary = await withoutProviderKeys(() =>
      translate({ config: anthropicConfig(), cwd: dir, dryRun: false, estimate: true }),
    );

    expect(summary.dryRun).toBe(true);
    expect(summary.estimate).toBeDefined();
  });

  it("accepts concurrency above one beside a token budget, because an estimate spends no budget", async () => {
    const dir = await project({ greeting: "Hello world" });

    const summary = await withoutProviderKeys(() =>
      translate({
        config: anthropicConfig({ maxTokens: 1000 }),
        cwd: dir,
        estimate: true,
        concurrency: 4,
      }),
    );

    expect(summary.estimate).toBeDefined();
  });
});
