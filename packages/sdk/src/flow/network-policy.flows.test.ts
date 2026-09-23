import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProvider, type ProviderConfig } from "../config/provider-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import type { CreateProvider } from "../selection/select-provider.js";
import { baseConfig, makeStubProvider, makeTempDir, writeJsonFile } from "../test-support.js";
import { type CreateWatcher, watch } from "../watch/watch.js";
import { retranslateEntry } from "./retranslate-entry.js";
import { translate } from "./translate-project.js";

const localOnly = (): VerbatraConfig => baseConfig({ network: { policy: "local-only" } });

async function project(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello" });
  return dir;
}

function recordingFactory() {
  return vi.fn<CreateProvider>(() => makeStubProvider().provider);
}

const inertWatcher: CreateWatcher = () => ({ onChange: () => {}, close: async () => {} });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("translate: network policy", () => {
  it("refuses a hosted provider before anything is constructed or written", async () => {
    const dir = await project();
    const factory = recordingFactory();
    await expect(
      translate({ config: localOnly(), cwd: dir }, { createProvider: factory }),
    ).rejects.toMatchObject({ name: "SdkError", code: "NETWORK_POLICY_VIOLATION" });
    expect(factory).not.toHaveBeenCalled();
    expect(await readdir(join(dir, "locales"))).toEqual(["en.json"]);
  });

  it("refuses under the environment pin when the config sets nothing", async () => {
    vi.stubEnv("VERBATRA_NETWORK_POLICY", "local-only");
    const dir = await project();
    const factory = recordingFactory();
    await expect(
      translate({ config: baseConfig(), cwd: dir }, { createProvider: factory }),
    ).rejects.toMatchObject({ code: "NETWORK_POLICY_VIOLATION" });
  });

  it("still plans a dry run, which calls no provider", async () => {
    const dir = await project();
    const summary = await translate(
      { config: localOnly(), cwd: dir, dryRun: true },
      { createProvider: recordingFactory() },
    );
    expect(summary.failed).toEqual([]);
  });

  it("hands a permitted provider the policy it must enforce per request", async () => {
    const dir = await project();
    const factory = recordingFactory();
    const config = baseConfig({
      network: { policy: "local-only" },
      provider: {
        id: "openai-compatible",
        options: { baseUrl: "http://127.0.0.1:1/v1", model: "m", maxOutputTokens: 64 },
      },
    });
    await translate({ config, cwd: dir }, { createProvider: factory });
    expect(factory.mock.calls[0]?.[1]?.network.policy.rules).toEqual([
      { source: "config", policy: "local-only", allowedHosts: [] },
    ]);
  });
});

describe("retranslateEntry and watch: network policy", () => {
  it("retranslateEntry refuses before the provider is constructed", async () => {
    const dir = await project();
    const factory = recordingFactory();
    await expect(
      retranslateEntry(
        { config: localOnly(), cwd: dir, locale: "de", key: "greeting" },
        { createProvider: factory },
      ),
    ).rejects.toMatchObject({ code: "NETWORK_POLICY_VIOLATION" });
    expect(factory).not.toHaveBeenCalled();
  });

  it("watch refuses at startup, before any watcher exists", async () => {
    const dir = await project();
    const createWatcher = vi.fn(inertWatcher);
    await expect(
      watch({ config: localOnly(), cwd: dir, onRun: () => {} }, { createWatcher }),
    ).rejects.toMatchObject({ code: "NETWORK_POLICY_VIOLATION" });
    expect(createWatcher).not.toHaveBeenCalled();
  });
});

describe("buildProvider: network context", () => {
  const network = {
    policy: {
      rules: [{ source: "config" as const, policy: "local-only" as const, allowedHosts: [] }],
    },
    env: {},
  };

  it.each<ProviderConfig>([
    { id: "anthropic", options: { model: "m", maxTokens: 1 } },
    { id: "openai", options: { model: "m", maxOutputTokens: 1 } },
    { id: "gemini", options: { model: "m", maxOutputTokens: 1 } },
    { id: "deepl", options: {} },
    { id: "google-translate", options: {} },
    {
      id: "openai-compatible",
      options: { baseUrl: "http://127.0.0.1:1/v1", model: "m", maxOutputTokens: 1 },
    },
  ])("constructs $id with and without a network context", (config) => {
    for (const name of [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "DEEPL_API_KEY",
      "GOOGLE_TRANSLATE_API_KEY",
    ]) {
      vi.stubEnv(name, "test-key-value");
    }
    expect(buildProvider(config, { network }).id).toBe(config.id);
    expect(buildProvider(config).id).toBe(config.id);
  });
});
